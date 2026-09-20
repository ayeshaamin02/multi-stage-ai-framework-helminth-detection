import {
  DEFAULT_STAGE3_MODEL_FILENAME,
  STAGE1_MODEL_FILENAMES,
  STAGE1_MODEL_INPUT_SIZE,
  STAGE2_MODEL_FILENAMES,
  STAGE2_MODEL_INPUT_SIZE,
  STAGE3_MODEL_FILENAMES,
  STAGE3_MODEL_INPUT_SIZE,
  getStage1ApiBaseUrl,
  getStage2ApiBaseUrl,
  getStage3ApiBaseUrl,
} from "@/lib/helminth-config";
import { isValidImageHashHex } from "@/lib/image-hash";
import { getPipelineVersionKey } from "@/lib/pipeline-version";
import {
  assertCanStartPipelineRun,
  findCacheSignature,
  findIdempotencyRun,
  getPipelineRunById,
  getPipelineRunForUser,
  getPipelineDashboardStats,
  insertCachedPipelineRun,
  insertIdempotencyKey,
  insertPipelineRun,
  listPipelineHistory,
  listProcessingRunsForUser,
  markPipelineRunCancelled,
  markPipelineRunFailed,
  MAX_CONCURRENT_PROCESSING,
  recordCacheSignatureHit,
  saveStage1Result,
  saveStage2Result,
  saveStage3Result,
  updatePipelineRunImageObjectKey,
  updateStage1ExternalJobId,
  updateStage2ExternalJobId,
  setStage1ExternalJobIdForExplanations,
  setStage2ExternalJobIdForExplanations,
  updateStage3ExternalJobId,
  upsertCacheSignature,
  type PipelineRunStatus,
  type PredictionCacheSignatureRow,
  type PredictionPipelineRunRow,
  type ProcessingPipelineRunRow,
  type StageRunStatus,
  type VoteSummary,
} from "@/lib/pipeline-db";
import {
  buildPredictionImageObjectKey,
  buildStage3AnnotatedObjectKey,
  copyPredictionImage,
  deletePredictionImage,
  getPredictionImage,
  streamWebBodyToBuffer,
  uploadPredictionImage,
  uploadPredictionImageBuffer,
} from "@/lib/server/prediction-image-storage";
import {
  trimStage3ResultPayload,
  trimStageBinaryResultPayload,
} from "@/lib/pipeline-result-payload";
import { renderStage3AnnotatedPng } from "@/lib/server/render-stage3-annotated-image";
import {
  fetchRemoteJobStatus,
  type HelminthStatusPayload,
} from "@/lib/helminth-remote";
import {
  activeStageFromRow,
  buildUnfinishedRunItem,
  externalJobIdForStage,
  isAwaitingStage2Start as isAwaitingStage2StartRow,
  isAwaitingStage3Start as isAwaitingStage3StartRow,
  isRunStaleByAge,
  type UnfinishedRunItem,
} from "@/lib/unfinished-run-meta";

const MAX_BYTES = 15 * 1024 * 1024;
/** Runs idle longer than this are treated as stalled (Docker restart, closed tab, etc.). */
const STALE_RUN_MS = 45 * 60 * 1000;
const ALLOWED = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/tiff",
  "image/x-png",
]);

type StageNumber = 1 | 2 | 3;

type StartMode = "pipeline" | "stage2-only";

export type PipelineErr = { ok: false; error: string; code?: string };

export type PipelineSubmitOk = {
  ok: true;
  cached?: false;
  id: string;
  stage: {
    stage: StageNumber;
    externalJobId: string;
    totalModels: number;
  };
  idempotent?: boolean;
};

/** Returned when an identical image + pipeline version was predicted before. */
export type PipelineCachedOk = {
  ok: true;
  cached: true;
  id: string;
  finalOutcome: string | null;
  cacheSourceCreatedAt: string | null;
  stage1Status: PredictionPipelineRunRow["stage1_status"];
  stage2Status: PredictionPipelineRunRow["stage2_status"];
  stage3Status: PredictionPipelineRunRow["stage3_status"];
  stage1VoteSummary: VoteSummary | null;
  stage2VoteSummary: VoteSummary | null;
  stage1ResultPayload: unknown | null;
  stage2ResultPayload: unknown | null;
  stage3ResultPayload: unknown | null;
  hasStage3AnnotatedImage: boolean;
  idempotent?: boolean;
};

export type PipelineSubmitResult = PipelineSubmitOk | PipelineCachedOk;

export type PipelineSubmitOptions = {
  imageHash?: string;
  forceRerun?: boolean;
  idempotencyKey?: string;
  skipStage1?: boolean;
  skipStage2?: boolean;
  stage3ModelFilename?: string;
};

export type PipelineStage2StartOk = {
  ok: true;
  stage: {
    stage: 2;
    externalJobId: string;
    totalModels: number;
  };
  idempotent?: boolean;
};

export type PipelineStage3StartOk = {
  ok: true;
  stage: {
    stage: 3;
    externalJobId: string;
    totalModels: number;
  };
  idempotent?: boolean;
};

export type PipelineFinalizeOk = {
  ok: true;
  runStatus: PipelineRunStatus;
  stage: StageNumber | null;
  persisted: boolean;
  remote?: Record<string, unknown>;
  gateDecision?: "fecal" | "non_fecal";
  awaitingStage2Start?: boolean;
  awaitingStage3Start?: boolean;
  idempotent?: boolean;
  finalOutcome?: string | null;
  stage1Status?: StageRunStatus;
  stage2Status?: StageRunStatus;
  stage3Status?: StageRunStatus;
  skipStage1Requested?: boolean;
  skipStage2Requested?: boolean;
};

export type PipelineSyncOk = {
  ok: true;
  runStatus: PipelineRunStatus;
  stage: StageNumber | null;
  persisted: boolean;
  remote?: Record<string, unknown>;
  gateDecision?: "fecal" | "non_fecal";
  awaitingStage2Start?: boolean;
  awaitingStage3Start?: boolean;
  finalOutcome?: string | null;
  stage1Status?: StageRunStatus;
  stage2Status?: StageRunStatus;
  stage3Status?: StageRunStatus;
  skipStage1Requested?: boolean;
  skipStage2Requested?: boolean;
};

type BatchStartResult = {
  externalJobId: string;
  totalModels: number;
};

type RemoteResultItem = {
  modelFilename?: unknown;
  classification?: {
    predicted_class?: unknown;
    max_prob?: unknown;
    probability?: unknown;
    class_probabilities?: Record<string, unknown>;
  };
};

function toRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object") {
    return value as Record<string, unknown>;
  }
  return {};
}

function toBinaryOrNull(value: unknown): 0 | 1 | null {
  if (value === 0 || value === 1) return value;
  return null;
}

function toPercentConfidence(
  classification: RemoteResultItem["classification"] | undefined,
): number | null {
  if (!classification || typeof classification !== "object") return null;

  const predicted = toBinaryOrNull(classification.predicted_class);
  const probs = classification.class_probabilities;
  if (
    probs &&
    typeof probs === "object" &&
    predicted !== null &&
    String(predicted) in probs
  ) {
    const raw = (probs as Record<string, unknown>)[String(predicted)];
    if (typeof raw === "number" && Number.isFinite(raw)) {
      return raw <= 1 ? raw * 100 : raw;
    }
  }

  if (
    typeof classification.max_prob === "number" &&
    Number.isFinite(classification.max_prob)
  ) {
    return classification.max_prob <= 1
      ? classification.max_prob * 100
      : classification.max_prob;
  }
  return null;
}

function fileValidationError(file: File): string | null {
  if (file.size === 0) {
    return "Empty file.";
  }
  if (file.size > MAX_BYTES) {
    return `File too large (max ${MAX_BYTES / (1024 * 1024)} MB).`;
  }
  const mime = (file.type || "application/octet-stream").toLowerCase();
  if (!ALLOWED.has(mime)) {
    return "Unsupported image type. Use JPEG, PNG, WebP, or TIFF.";
  }
  return null;
}

function dbErrorMessage(reason: unknown): string {
  const message = reason instanceof Error ? reason.message : "Database error";
  if (message.includes("DATABASE_URL")) {
    return "Database is not configured (DATABASE_URL).";
  }
  return message;
}

function runError(reason: unknown): string {
  return reason instanceof Error ? reason.message : "Server error";
}

function getStage1MajorityClass(run: PredictionPipelineRunRow): 0 | 1 | null {
  const summary = toRecord(run.stage1_vote_summary);
  const candidate = summary.majorityClass;
  if (candidate === 0 || candidate === 1) {
    return candidate;
  }

  const payload = toRecord(run.stage1_result_payload);
  const resultsRaw = payload.results;
  const results = Array.isArray(resultsRaw) ? resultsRaw : [];
  let positiveVotes = 0;
  let negativeVotes = 0;
  for (const item of results) {
    const cls = toRecord(toRecord(item).classification).predicted_class;
    if (cls === 0) positiveVotes++;
    if (cls === 1) negativeVotes++;
  }
  return positiveVotes > negativeVotes ? 0 : 1;
}

function isStage1Positive(run: PredictionPipelineRunRow): boolean {
  // Stage 1 mapping: 0 = fecal, 1 = non fecal.
  return getStage1MajorityClass(run) === 0;
}

function activeStage(run: PredictionPipelineRunRow): StageNumber | null {
  if (run.status !== "processing") return null;
  if (run.stage3_status === "processing") return 3;
  if (run.stage2_status === "processing") return 2;
  if (run.stage1_status === "processing") return 1;
  return null;
}

function isUserSkippedStage2(run: PredictionPipelineRunRow): boolean {
  if (run.skip_stage2_requested) return true;
  return run.stage2_status === "skipped" && run.stage3_status === "pending";
}

function runStatusFields(run: PredictionPipelineRunRow): {
  finalOutcome: string | null;
  stage1Status: StageRunStatus;
  stage2Status: StageRunStatus;
  stage3Status: StageRunStatus;
  skipStage1Requested: boolean;
  skipStage2Requested: boolean;
} {
  return {
    finalOutcome: run.final_outcome,
    stage1Status: run.stage1_status,
    stage2Status: run.stage2_status,
    stage3Status: run.stage3_status,
    skipStage1Requested: run.skip_stage1_requested,
    skipStage2Requested: run.skip_stage2_requested,
  };
}

function shouldAwaitStage2Start(run: PredictionPipelineRunRow): boolean {
  return (
    run.status === "processing" &&
    run.stage1_status === "finished" &&
    run.stage2_status === "pending" &&
    isStage1Positive(run)
  );
}

function isStage2HelminthPositive(run: PredictionPipelineRunRow): boolean {
  const summary = run.stage2_vote_summary;
  if (!summary || typeof summary !== "object") return false;
  const mc = (summary as VoteSummary).majorityClass;
  return mc === 0;
}

function shouldAwaitStage3Start(run: PredictionPipelineRunRow): boolean {
  if (run.status !== "processing" || run.stage3_status !== "pending") {
    return false;
  }
  if (
    run.stage2_status === "finished" &&
    isStage2HelminthPositive(run)
  ) {
    return true;
  }
  return (
    isUserSkippedStage2(run) &&
    (run.stage1_status === "finished" || run.stage1_status === "skipped")
  );
}

function persistedPayload(run: PredictionPipelineRunRow): Record<string, unknown> | undefined {
  if (run.stage3_result_payload) return toRecord(run.stage3_result_payload);
  if (run.stage2_result_payload) return toRecord(run.stage2_result_payload);
  if (run.stage1_result_payload) return toRecord(run.stage1_result_payload);
  return undefined;
}

function cachedOkFromRun(
  run: PredictionPipelineRunRow,
  extra?: { idempotent?: boolean },
): PipelineCachedOk {
  return {
    ok: true,
    cached: true,
    id: run.id,
    finalOutcome: run.final_outcome,
    cacheSourceCreatedAt: run.cache_source_run_id ? run.created_at : null,
    stage1Status: run.stage1_status,
    stage2Status: run.stage2_status,
    stage3Status: run.stage3_status,
    stage1VoteSummary: run.stage1_vote_summary,
    stage2VoteSummary: run.stage2_vote_summary,
    stage1ResultPayload: run.stage1_result_payload,
    stage2ResultPayload: run.stage2_result_payload,
    stage3ResultPayload: run.stage3_result_payload,
    hasStage3AnnotatedImage: Boolean(run.stage3_annotated_image_object_key),
    idempotent: extra?.idempotent,
  };
}

async function writeCacheIfEligible(
  run: PredictionPipelineRunRow,
): Promise<void> {
  if (run.status !== "finished" || run.cache_hit || !run.image_hash) return;
  if (!run.final_outcome) return;
  if (
    !run.stage1_vote_summary &&
    !run.stage2_vote_summary &&
    !run.stage3_result_payload
  ) {
    return;
  }

  try {
    await upsertCacheSignature({
      imageHash: run.image_hash,
      pipelineVersionKey: getPipelineVersionKey(),
      stage1VoteSummary: run.stage1_vote_summary,
      stage2VoteSummary: run.stage2_vote_summary,
      stage3ResultPayload: run.stage3_result_payload,
      finalOutcome: run.final_outcome,
      sourceRunId: run.id,
    });
  } catch {
    /* Cache write failure must not break the user-facing run. */
  }
}

async function submitFromCache(
  userId: string,
  file: File,
  imageHash: string,
  signature: PredictionCacheSignatureRow,
): Promise<PipelineCachedOk | PipelineErr> {
  const validationErr = fileValidationError(file);
  if (validationErr) {
    return { ok: false, error: validationErr };
  }

  try {
    await releaseStaleProcessingSlots(userId);
    await assertCanStartPipelineRun(userId);
  } catch (reason) {
    return { ok: false, error: runError(reason), code: "429" };
  }

  const runId = crypto.randomUUID();
  const imageObjectKey = buildPredictionImageObjectKey({
    userId,
    runId,
    mimeType: file.type || "application/octet-stream",
  });

  let stage3AnnotatedImageObjectKey: string | null = null;
  if (
    signature.final_outcome === "helminth_positive" &&
    signature.source_run_id
  ) {
    const sourceRun = await getPipelineRunById(signature.source_run_id);
    const sourceKey = sourceRun?.stage3_annotated_image_object_key;
    if (sourceKey) {
      const destKey = buildStage3AnnotatedObjectKey({ userId, runId });
      try {
        await copyPredictionImage({ sourceKey, destKey });
        stage3AnnotatedImageObjectKey = destKey;
      } catch {
        /* Optional asset */
      }
    }
  }

  try {
    await uploadPredictionImage({ objectKey: imageObjectKey, file });
    await insertCachedPipelineRun({
      userId,
      runId,
      originalFilename: file.name || null,
      imageObjectKey,
      imageHash,
      cacheSourceRunId: signature.source_run_id,
      signature,
      stage3AnnotatedImageObjectKey,
    });
    await recordCacheSignatureHit(imageHash, signature.pipeline_version_key);
  } catch (reason) {
    return { ok: false, error: dbErrorMessage(reason) };
  }

  const run = await getPipelineRunForUser(runId, userId);
  if (!run) {
    return { ok: false, error: "Could not load cached run after insert." };
  }
  return cachedOkFromRun(run);
}

async function buildSubmitResponseFromExistingRun(
  run: PredictionPipelineRunRow,
): Promise<PipelineSubmitResult | PipelineErr> {
  if (run.status === "finished") {
    return cachedOkFromRun(run, { idempotent: true });
  }
  if (run.status === "processing") {
    const stage =
      run.stage3_status === "processing"
        ? 3
        : run.stage2_status === "processing"
          ? 2
          : run.stage1_status === "processing"
            ? 1
            : null;
    const externalJobId =
      stage === 1
        ? run.stage1_external_job_id
        : stage === 2
          ? run.stage2_external_job_id
          : stage === 3
            ? run.stage3_external_job_id
            : null;
    if (stage && externalJobId) {
      return {
        ok: true,
        id: run.id,
        stage: {
          stage,
          externalJobId,
          totalModels:
            stage === 1
              ? STAGE1_MODEL_FILENAMES.length
              : stage === 2
                ? STAGE2_MODEL_FILENAMES.length
                : STAGE3_MODEL_FILENAMES.length,
        },
        idempotent: true,
      };
    }
  }
  return { ok: false, error: "Previous run is not resumable." };
}

function buildVoteSummary(
  payload: HelminthStatusPayload,
  expectedModelFilenames: readonly string[],
): VoteSummary {
  const byModel = new Map<
    string,
    { predictedClass: number | null; maxProb: number | null }
  >();
  const results = Array.isArray(payload.results) ? payload.results : [];

  for (const entry of results) {
    const row = entry as RemoteResultItem;
    const modelFilename =
      typeof row.modelFilename === "string" ? row.modelFilename : null;
    if (!modelFilename) continue;
    const predictedClass = toBinaryOrNull(row.classification?.predicted_class);
    const maxProb = toPercentConfidence(row.classification);
    byModel.set(modelFilename, { predictedClass, maxProb });
  }

  const modelVotes = expectedModelFilenames.map((modelFilename) => {
    const vote = byModel.get(modelFilename);
    return {
      modelFilename,
      predictedClass: vote?.predictedClass ?? null,
      maxProb: vote?.maxProb ?? null,
    };
  });

  // Class mapping in this project:
  // Stage 1: 0=fecal, 1=non fecal
  // Stage 2: 0=helminths, 1=non-helminths
  const positiveVotes = modelVotes.filter((v) => v.predictedClass === 0).length;
  const negativeVotes = modelVotes.filter((v) => v.predictedClass === 1).length;

  return {
    totalModels: expectedModelFilenames.length,
    positiveVotes,
    negativeVotes,
    majorityClass: positiveVotes > negativeVotes ? 0 : 1,
    modelVotes,
  };
}

async function startRemoteBatch(params: {
  apiBaseUrl: string;
  file: File;
  modelInputFeatureSize: number;
  modelFilenames: readonly string[];
}): Promise<BatchStartResult> {
  const forward = new FormData();
  forward.set("modelInputFeatureSize", String(params.modelInputFeatureSize));
  for (const filename of params.modelFilenames) {
    forward.append("modelFilenames", filename);
  }
  forward.set("image", params.file, params.file.name || "upload.jpg");

  const base = params.apiBaseUrl.replace(/\/$/, "");
  let remote: Response;
  try {
    remote = await fetch(`${base}/predict/batch`, {
      method: "POST",
      body: forward,
      cache: "no-store",
    });
  } catch (reason) {
    throw new Error(`Could not reach helminth API: ${runError(reason)}`);
  }

  if (!remote.ok) {
    const detail = await remote.text();
    throw new Error(`Batch HTTP ${remote.status}: ${detail.slice(0, 500)}`);
  }

  const body = (await remote.json()) as {
    job_id?: unknown;
    total_models?: unknown;
  };
  const externalJobId = typeof body.job_id === "string" ? body.job_id : "";
  if (!externalJobId) {
    throw new Error("Helminth API returned no job_id.");
  }

  const totalModels =
    typeof body.total_models === "number" && Number.isFinite(body.total_models)
      ? body.total_models
      : params.modelFilenames.length;

  return { externalJobId, totalModels };
}

async function fetchStageStatus(
  run: PredictionPipelineRunRow,
  stage: StageNumber,
): Promise<HelminthStatusPayload> {
  const externalJobId =
    stage === 1
      ? run.stage1_external_job_id
      : stage === 2
        ? run.stage2_external_job_id
        : run.stage3_external_job_id;
  if (!externalJobId) {
    throw new Error(`Stage ${stage} has no external job id yet.`);
  }
  const base =
    stage === 1
      ? getStage1ApiBaseUrl()
      : stage === 2
        ? getStage2ApiBaseUrl()
        : getStage3ApiBaseUrl();
  return fetchRemoteJobStatus(base, externalJobId);
}

async function saveFinishedStage1(params: {
  run: PredictionPipelineRunRow;
  userId: string;
  remote: HelminthStatusPayload;
}): Promise<{
  runStatus: PipelineRunStatus;
  gateDecision: "fecal" | "non_fecal";
  awaitingStage2Start: boolean;
  awaitingStage3Start?: boolean;
}> {
  const voteSummary = buildVoteSummary(params.remote, STAGE1_MODEL_FILENAMES);
  const isFecal = voteSummary.majorityClass === 0;
  const userSkippedStage2 = isUserSkippedStage2(params.run);
  await saveStage1Result({
    runId: params.run.id,
    userId: params.userId,
    payload: trimStageBinaryResultPayload(params.remote, voteSummary),
    voteSummary,
    isFecal,
    userSkippedStage2,
  });
  if (userSkippedStage2) {
    return {
      runStatus: "processing",
      gateDecision: isFecal ? "fecal" : "non_fecal",
      awaitingStage2Start: false,
      awaitingStage3Start: true,
    };
  }
  if (!isFecal) {
    const updated = await getPipelineRunForUser(params.run.id, params.userId);
    if (updated) await writeCacheIfEligible(updated);
  }
  return {
    runStatus: isFecal ? "processing" : "finished",
    gateDecision: isFecal ? "fecal" : "non_fecal",
    awaitingStage2Start: isFecal,
  };
}

async function saveFinishedStage2(params: {
  run: PredictionPipelineRunRow;
  userId: string;
  remote: HelminthStatusPayload;
}): Promise<{
  runStatus: PipelineRunStatus;
  awaitingStage3Start: boolean;
}> {
  const voteSummary = buildVoteSummary(params.remote, STAGE2_MODEL_FILENAMES);
  const finalOutcome =
    voteSummary.majorityClass === 0
      ? "helminth_positive"
      : "helminth_negative";
  const awaitStage3 = finalOutcome === "helminth_positive";
  await saveStage2Result({
    runId: params.run.id,
    userId: params.userId,
    payload: trimStageBinaryResultPayload(params.remote, voteSummary),
    voteSummary,
    finalOutcome,
    awaitStage3,
  });
  if (!awaitStage3) {
    const updated = await getPipelineRunForUser(params.run.id, params.userId);
    if (updated) await writeCacheIfEligible(updated);
  }
  return {
    runStatus: awaitStage3 ? "processing" : "finished",
    awaitingStage3Start: awaitStage3,
  };
}

async function saveFinishedStage3(params: {
  run: PredictionPipelineRunRow;
  userId: string;
  remote: HelminthStatusPayload;
}): Promise<{
  runStatus: PipelineRunStatus;
}> {
  let annotatedImageObjectKey: string | null = null;
  const imageKey = params.run.image_object_key;
  if (imageKey) {
    try {
      const stored = await getPredictionImage(imageKey);
      if (stored?.body) {
        const imageBuf = await streamWebBodyToBuffer(stored.body);
        const png = await renderStage3AnnotatedPng({
          imageBuf,
          remote: params.remote,
        });
        if (png) {
          const key = buildStage3AnnotatedObjectKey({
            userId: params.userId,
            runId: params.run.id,
          });
          await uploadPredictionImageBuffer({
            objectKey: key,
            body: png,
            contentType: "image/png",
          });
          annotatedImageObjectKey = key;
        }
      }
    } catch {
      /* Optional asset: R2/Sharp failures should not block persisting JSON results. */
    }
  }
  await saveStage3Result({
    runId: params.run.id,
    userId: params.userId,
    payload: trimStage3ResultPayload(params.remote),
    annotatedImageObjectKey,
  });
  const updated = await getPipelineRunForUser(params.run.id, params.userId);
  if (updated) await writeCacheIfEligible(updated);
  return { runStatus: "finished" };
}

function resolvePipelineStartStage(
  skipStage1: boolean,
  skipStage2: boolean,
): StageNumber {
  if (skipStage1 && skipStage2) return 3;
  if (skipStage1) return 2;
  return 1;
}

function initialPipelineStageStatuses(
  startStage: StageNumber,
  skipStage2: boolean,
): {
  stage1Status: StageRunStatus;
  stage2Status: StageRunStatus;
  stage3Status: StageRunStatus;
} {
  if (startStage === 3) {
    return {
      stage1Status: "skipped",
      stage2Status: "skipped",
      stage3Status: "processing",
    };
  }
  if (startStage === 2) {
    return {
      stage1Status: "skipped",
      stage2Status: "processing",
      stage3Status: "pending",
    };
  }
  return {
    stage1Status: "processing",
    stage2Status: skipStage2 ? "skipped" : "pending",
    stage3Status: "pending",
  };
}

function stageBatchConfig(
  stage: StageNumber,
  stage3ModelFilename?: string,
): {
  modelFilenames: readonly string[];
  modelInputFeatureSize: number;
  apiBaseUrl: string;
} {
  if (stage === 1) {
    return {
      modelFilenames: STAGE1_MODEL_FILENAMES,
      modelInputFeatureSize: STAGE1_MODEL_INPUT_SIZE,
      apiBaseUrl: getStage1ApiBaseUrl(),
    };
  }
  if (stage === 2) {
    return {
      modelFilenames: STAGE2_MODEL_FILENAMES,
      modelInputFeatureSize: STAGE2_MODEL_INPUT_SIZE,
      apiBaseUrl: getStage2ApiBaseUrl(),
    };
  }
  const modelFilename = stage3ModelFilename ?? STAGE3_MODEL_FILENAMES[0];
  if (!(STAGE3_MODEL_FILENAMES as readonly string[]).includes(modelFilename)) {
    throw new Error("Unknown Stage 3 model.");
  }
  return {
    modelFilenames: [modelFilename],
    modelInputFeatureSize: STAGE3_MODEL_INPUT_SIZE,
    apiBaseUrl: getStage3ApiBaseUrl(),
  };
}

async function startRun(
  userId: string,
  file: File,
  mode: StartMode,
  imageHash?: string | null,
  pipelineOptions?: {
    skipStage1?: boolean;
    skipStage2?: boolean;
    stage3ModelFilename?: string;
  },
): Promise<PipelineSubmitOk | PipelineErr> {
  const validationErr = fileValidationError(file);
  if (validationErr) {
    return { ok: false, error: validationErr };
  }

  try {
    await releaseStaleProcessingSlots(userId);
    await assertCanStartPipelineRun(userId);
  } catch (reason) {
    return { ok: false, error: runError(reason), code: "429" };
  }

  const runId = crypto.randomUUID();
  const skipStage1 = Boolean(pipelineOptions?.skipStage1);
  const skipStage2 = Boolean(pipelineOptions?.skipStage2);
  const stage: StageNumber =
    mode === "pipeline"
      ? resolvePipelineStartStage(skipStage1, skipStage2)
      : 2;
  let batchConfig: ReturnType<typeof stageBatchConfig>;
  try {
    batchConfig = stageBatchConfig(stage, pipelineOptions?.stage3ModelFilename);
  } catch (reason) {
    return { ok: false, error: runError(reason) };
  }
  const { modelFilenames, modelInputFeatureSize, apiBaseUrl } = batchConfig;
  const imageObjectKey = buildPredictionImageObjectKey({
    userId,
    runId,
    mimeType: file.type || "application/octet-stream",
  });
  const initialStatuses =
    mode === "pipeline"
      ? initialPipelineStageStatuses(stage, skipStage2)
      : {
          stage1Status: "skipped" as const,
          stage2Status: "processing" as const,
          stage3Status: "skipped" as const,
        };

  try {
    await insertPipelineRun({
      userId,
      runId,
      originalFilename: file.name || null,
      imageObjectKey: null,
      imageHash: imageHash ?? null,
      stage1Status: initialStatuses.stage1Status,
      stage2Status: initialStatuses.stage2Status,
      stage3Status: initialStatuses.stage3Status,
      skipStage1Requested: mode === "pipeline" ? skipStage1 : false,
      skipStage2Requested: mode === "pipeline" ? skipStage2 : false,
    });
  } catch (reason) {
    return { ok: false, error: dbErrorMessage(reason) };
  }

  try {
    await uploadPredictionImage({
      objectKey: imageObjectKey,
      file,
    });
    await updatePipelineRunImageObjectKey({
      runId,
      userId,
      imageObjectKey,
      imageHash: imageHash ?? null,
    });
  } catch (reason) {
    const message = `Could not store uploaded image: ${runError(reason)}`;
    await markPipelineRunFailed({
      runId,
      userId,
      stage,
      message,
    });
    try {
      await deletePredictionImage(imageObjectKey);
    } catch {
      // Best effort cleanup for partially written objects.
    }
    return { ok: false, error: message };
  }

  let batch: BatchStartResult;
  try {
    batch = await startRemoteBatch({
      apiBaseUrl,
      file,
      modelInputFeatureSize,
      modelFilenames,
    });
  } catch (reason) {
    const message = runError(reason);
    await markPipelineRunFailed({
      runId,
      userId,
      stage,
      message,
    });
    return { ok: false, error: message };
  }

  try {
    if (stage === 1) {
      await updateStage1ExternalJobId({
        runId,
        userId,
        externalJobId: batch.externalJobId,
      });
    } else if (stage === 2) {
      await updateStage2ExternalJobId({
        runId,
        userId,
        externalJobId: batch.externalJobId,
      });
    } else {
      await updateStage3ExternalJobId({
        runId,
        userId,
        externalJobId: batch.externalJobId,
        modelFilename: modelFilenames[0] ?? null,
      });
    }
  } catch (reason) {
    await markPipelineRunFailed({
      runId,
      userId,
      stage,
      message: `Could not save job id: ${runError(reason)}`,
    });
    return { ok: false, error: "Could not save run after starting job." };
  }

  return {
    ok: true,
    id: runId,
    stage: {
      stage,
      externalJobId: batch.externalJobId,
      totalModels: batch.totalModels,
    },
  };
}

export async function serviceSubmitPipelineRun(
  userId: string,
  file: File,
  options?: PipelineSubmitOptions,
): Promise<PipelineSubmitResult | PipelineErr> {
  if (options?.idempotencyKey) {
    const existingRunId = await findIdempotencyRun(
      userId,
      options.idempotencyKey,
    );
    if (existingRunId) {
      const existingRun = await getPipelineRunForUser(existingRunId, userId);
      if (existingRun) {
        return buildSubmitResponseFromExistingRun(existingRun);
      }
    }
  }

  const imageHash = options?.imageHash;
  if (
    imageHash &&
    isValidImageHashHex(imageHash) &&
    !options?.forceRerun
  ) {
    const signature = await findCacheSignature(
      imageHash,
      getPipelineVersionKey(),
    );
    if (signature) {
      const cached = await submitFromCache(userId, file, imageHash, signature);
      if (cached.ok && options?.idempotencyKey) {
        await insertIdempotencyKey({
          userId,
          key: options.idempotencyKey,
          runId: cached.id,
        });
      }
      if (cached.ok) {
        return {
          ...cached,
          cacheSourceCreatedAt: signature.created_at,
        };
      }
      return cached;
    }
  }

  const result = await startRun(
    userId,
    file,
    "pipeline",
    imageHash && isValidImageHashHex(imageHash) ? imageHash : null,
    {
      skipStage1: options?.skipStage1,
      skipStage2: options?.skipStage2,
      stage3ModelFilename: options?.stage3ModelFilename,
    },
  );
  if (result.ok && options?.idempotencyKey) {
    await insertIdempotencyKey({
      userId,
      key: options.idempotencyKey,
      runId: result.id,
    });
  }
  return result;
}

export async function serviceSubmitStage2OnlyRun(
  userId: string,
  file: File,
): Promise<PipelineSubmitOk | PipelineErr> {
  return startRun(userId, file, "stage2-only");
}

export async function serviceStartPipelineStage2(
  userId: string,
  runId: string,
  file: File,
): Promise<PipelineStage2StartOk | PipelineErr> {
  const validationErr = fileValidationError(file);
  if (validationErr) {
    return { ok: false, error: validationErr };
  }

  const run = await getPipelineRunForUser(runId, userId);
  if (!run) {
    return { ok: false, error: "Not found." };
  }

  if (run.status !== "processing") {
    return { ok: false, error: "Run is not in processing state." };
  }

  if (run.stage2_status === "processing" && run.stage2_external_job_id) {
    return {
      ok: true,
      idempotent: true,
      stage: {
        stage: 2,
        externalJobId: run.stage2_external_job_id,
        totalModels: STAGE2_MODEL_FILENAMES.length,
      },
    };
  }

  if (run.stage2_status === "finished") {
    return { ok: false, error: "Stage 2 already finished." };
  }

  if (run.stage2_status === "skipped") {
    return { ok: false, error: "Stage 2 was skipped for this run." };
  }

  if (run.stage1_status !== "finished" && run.stage1_status !== "skipped") {
    return { ok: false, error: "Stage 1 is not complete yet." };
  }
  if (run.stage1_status === "finished" && !isStage1Positive(run)) {
    return {
      ok: false,
      error: "Stage 2 cannot start because Stage 1 is non fecal.",
    };
  }

  let batch: BatchStartResult;
  try {
    batch = await startRemoteBatch({
      apiBaseUrl: getStage2ApiBaseUrl(),
      file,
      modelInputFeatureSize: STAGE2_MODEL_INPUT_SIZE,
      modelFilenames: STAGE2_MODEL_FILENAMES,
    });
  } catch (reason) {
    const message = runError(reason);
    await markPipelineRunFailed({
      runId,
      userId,
      stage: 2,
      message,
    });
    return { ok: false, error: message };
  }

  try {
    await updateStage2ExternalJobId({
      runId,
      userId,
      externalJobId: batch.externalJobId,
    });
  } catch (reason) {
    const message = runError(reason);
    await markPipelineRunFailed({
      runId,
      userId,
      stage: 2,
      message: `Could not save stage 2 job id: ${message}`,
    });
    return { ok: false, error: "Could not save Stage 2 job id." };
  }

  return {
    ok: true,
    stage: {
      stage: 2,
      externalJobId: batch.externalJobId,
      totalModels: batch.totalModels,
    },
  };
}

export async function serviceStartPipelineStage3(
  userId: string,
  runId: string,
  file: File,
  modelFilename: string,
): Promise<PipelineStage3StartOk | PipelineErr> {
  const validationErr = fileValidationError(file);
  if (validationErr) {
    return { ok: false, error: validationErr };
  }

  const run = await getPipelineRunForUser(runId, userId);
  if (!run) {
    return { ok: false, error: "Not found." };
  }

  if (run.status !== "processing") {
    return { ok: false, error: "Run is not in processing state." };
  }

  if (!(STAGE3_MODEL_FILENAMES as readonly string[]).includes(modelFilename)) {
    return { ok: false, error: "Unknown Stage 3 model." };
  }

  if (run.stage3_status === "processing" && run.stage3_external_job_id) {
    return {
      ok: true,
      idempotent: true,
      stage: {
        stage: 3,
        externalJobId: run.stage3_external_job_id,
        totalModels: 1,
      },
    };
  }

  if (run.stage3_status === "finished") {
    return { ok: false, error: "Stage 3 already finished." };
  }

  if (run.stage3_status === "skipped") {
    return { ok: false, error: "Stage 3 was skipped for this run." };
  }

  if (run.stage2_status !== "finished") {
    if (!isUserSkippedStage2(run)) {
      return { ok: false, error: "Stage 2 is not complete yet." };
    }
    if (run.stage1_status !== "finished" && run.stage1_status !== "skipped") {
      return { ok: false, error: "Stage 1 is not complete yet." };
    }
  } else if (!isStage2HelminthPositive(run)) {
    return {
      ok: false,
      error: "Stage 3 cannot start because Stage 2 did not detect helminth.",
    };
  }

  let batch: BatchStartResult;
  try {
    batch = await startRemoteBatch({
      apiBaseUrl: getStage3ApiBaseUrl(),
      file,
      modelInputFeatureSize: STAGE3_MODEL_INPUT_SIZE,
      modelFilenames: [modelFilename],
    });
  } catch (reason) {
    const message = runError(reason);
    await markPipelineRunFailed({
      runId,
      userId,
      stage: 3,
      message,
    });
    return { ok: false, error: message };
  }

  try {
    await updateStage3ExternalJobId({
      runId,
      userId,
      externalJobId: batch.externalJobId,
      modelFilename,
    });
  } catch (reason) {
    const message = runError(reason);
    await markPipelineRunFailed({
      runId,
      userId,
      stage: 3,
      message: `Could not save stage 3 job id: ${message}`,
    });
    return { ok: false, error: "Could not save Stage 3 job id." };
  }

  return {
    ok: true,
    stage: {
      stage: 3,
      externalJobId: batch.externalJobId,
      totalModels: batch.totalModels,
    },
  };
}

export async function serviceFinalizePipelineRun(
  userId: string,
  runId: string,
): Promise<PipelineFinalizeOk | PipelineErr> {
  const run = await getPipelineRunForUser(runId, userId);
  if (!run) {
    return { ok: false, error: "Not found." };
  }

  if (run.status === "finished") {
    return {
      ok: true,
      idempotent: true,
      runStatus: run.status,
      stage: null,
      persisted: true,
      remote: persistedPayload(run),
      ...runStatusFields(run),
    };
  }

  if (run.status === "failed") {
    return { ok: false, error: run.error_message || "Run failed." };
  }

  const stage = activeStage(run);
  if (!stage) {
    if (shouldAwaitStage3Start(run)) {
      return {
        ok: true,
        runStatus: "processing",
        stage: 3,
        persisted: true,
        awaitingStage3Start: true,
        ...runStatusFields(run),
      };
    }
    if (shouldAwaitStage2Start(run)) {
      return {
        ok: true,
        runStatus: "processing",
        stage: 2,
        persisted: true,
        gateDecision: "fecal",
        awaitingStage2Start: true,
        ...runStatusFields(run),
      };
    }
    return {
      ok: true,
      idempotent: true,
      runStatus: run.status,
      stage: null,
      persisted: false,
    };
  }

  let remote: HelminthStatusPayload;
  try {
    remote = await fetchStageStatus(run, stage);
  } catch (reason) {
    const message = runError(reason);
    await markPipelineRunFailed({
      runId: run.id,
      userId,
      stage,
      message,
    });
    return { ok: false, error: message };
  }

  const remoteObj = toRecord(remote);
  if (remote.status !== "finished") {
    if (remote.status === "failed") {
      const msg = `Stage ${stage} failed in remote API.`;
      await markPipelineRunFailed({
        runId: run.id,
        userId,
        stage,
        message: msg,
      });
      return { ok: false, error: msg };
    }
    return { ok: false, error: `Stage ${stage} not finished yet.` };
  }

  try {
    if (stage === 1) {
      const stage1 = await saveFinishedStage1({
        run,
        userId,
        remote,
      });
      const updated = await getPipelineRunForUser(run.id, userId);
      return {
        ok: true,
        runStatus: stage1.runStatus,
        stage: 1,
        persisted: true,
        remote: remoteObj,
        gateDecision: stage1.gateDecision,
        awaitingStage2Start: stage1.awaitingStage2Start,
        awaitingStage3Start: stage1.awaitingStage3Start,
        ...(updated ? runStatusFields(updated) : runStatusFields(run)),
      };
    }

    if (stage === 2) {
      const stage2 = await saveFinishedStage2({
        run,
        userId,
        remote,
      });
      const updated = await getPipelineRunForUser(run.id, userId);
      return {
        ok: true,
        runStatus: stage2.runStatus,
        stage: 2,
        persisted: true,
        remote: remoteObj,
        awaitingStage3Start: stage2.awaitingStage3Start,
        ...(updated ? runStatusFields(updated) : runStatusFields(run)),
      };
    }

    const stage3 = await saveFinishedStage3({
      run,
      userId,
      remote,
    });
    const updated = await getPipelineRunForUser(run.id, userId);
    return {
      ok: true,
      runStatus: stage3.runStatus,
      stage: 3,
      persisted: true,
      remote: remoteObj,
      ...(updated ? runStatusFields(updated) : runStatusFields(run)),
    };
  } catch (reason) {
    const message = runError(reason);
    await markPipelineRunFailed({
      runId: run.id,
      userId,
      stage,
      message,
    });
    return { ok: false, error: message };
  }
}

export async function serviceSyncPipelineRun(
  userId: string,
  runId: string,
): Promise<PipelineSyncOk | PipelineErr> {
  const run = await getPipelineRunForUser(runId, userId);
  if (!run) {
    return { ok: false, error: "Not found." };
  }

  if (run.status === "finished") {
    return {
      ok: true,
      runStatus: run.status,
      stage: null,
      persisted: true,
      remote: persistedPayload(run),
      ...runStatusFields(run),
    };
  }

  if (run.status === "failed") {
    return { ok: false, error: run.error_message || "Run failed." };
  }

  const stage = activeStage(run);
  if (!stage) {
    if (shouldAwaitStage3Start(run)) {
      return {
        ok: true,
        runStatus: "processing",
        stage: 3,
        persisted: true,
        awaitingStage3Start: true,
        ...runStatusFields(run),
      };
    }
    if (shouldAwaitStage2Start(run)) {
      return {
        ok: true,
        runStatus: "processing",
        stage: 2,
        persisted: true,
        gateDecision: "fecal",
        awaitingStage2Start: true,
        ...runStatusFields(run),
      };
    }
    return {
      ok: true,
      runStatus: run.status,
      stage: null,
      persisted: false,
    };
  }

  let remote: HelminthStatusPayload;
  try {
    remote = await fetchStageStatus(run, stage);
  } catch (reason) {
    return { ok: false, error: runError(reason) };
  }

  const remoteObj = toRecord(remote);
  if (remote.status !== "finished") {
    if (remote.status === "failed") {
      const message = `Stage ${stage} failed in remote API.`;
      await markPipelineRunFailed({
        runId: run.id,
        userId,
        stage,
        message,
      });
      return { ok: false, error: message };
    }
    return {
      ok: true,
      runStatus: "processing",
      stage,
      persisted: false,
      remote: remoteObj,
    };
  }

  try {
    if (stage === 1) {
      const stage1 = await saveFinishedStage1({
        run,
        userId,
        remote,
      });
      const updated = await getPipelineRunForUser(run.id, userId);
      return {
        ok: true,
        runStatus: stage1.runStatus,
        stage: 1,
        persisted: true,
        remote: remoteObj,
        gateDecision: stage1.gateDecision,
        awaitingStage2Start: stage1.awaitingStage2Start,
        awaitingStage3Start: stage1.awaitingStage3Start,
        ...(updated ? runStatusFields(updated) : runStatusFields(run)),
      };
    }

    if (stage === 2) {
      const stage2 = await saveFinishedStage2({
        run,
        userId,
        remote,
      });
      const updated = await getPipelineRunForUser(run.id, userId);
      return {
        ok: true,
        runStatus: stage2.runStatus,
        stage: 2,
        persisted: true,
        remote: remoteObj,
        awaitingStage3Start: stage2.awaitingStage3Start,
        ...(updated ? runStatusFields(updated) : runStatusFields(run)),
      };
    }

    const stage3 = await saveFinishedStage3({
      run,
      userId,
      remote,
    });
    const updated = await getPipelineRunForUser(run.id, userId);
    return {
      ok: true,
      runStatus: stage3.runStatus,
      stage: 3,
      persisted: true,
      remote: remoteObj,
      ...(updated ? runStatusFields(updated) : runStatusFields(run)),
    };
  } catch (reason) {
    return { ok: false, error: runError(reason) };
  }
}

export async function serviceListPipelineHistory(
  userId: string,
  limit: number,
  offset = 0,
): Promise<{ ok: true; items: PredictionPipelineRunRow[] } | PipelineErr> {
  try {
    const items = await listPipelineHistory(userId, limit, offset);
    return { ok: true, items };
  } catch (reason) {
    return { ok: false, error: dbErrorMessage(reason) };
  }
}

export async function serviceGetPipelineStats(
  userId: string,
): Promise<
  | {
      ok: true;
      stats: {
        totalPredictions: number;
        fecalDetectedStage1: number;
        helminthPositivePhase2: number;
        speciesDetectionsCount: number;
      };
    }
  | PipelineErr
> {
  try {
    const stats = await getPipelineDashboardStats(userId);
    return { ok: true, stats };
  } catch (reason) {
    return { ok: false, error: dbErrorMessage(reason) };
  }
}

async function fetchRunImageAsFile(
  run: PredictionPipelineRunRow,
): Promise<File | null> {
  if (!run.image_object_key) return null;
  const stored = await getPredictionImage(run.image_object_key);
  if (!stored?.body) return null;
  const buf = await streamWebBodyToBuffer(stored.body);
  return new File([new Uint8Array(buf)], run.original_filename ?? "upload.jpg", {
    type: stored.contentType || "application/octet-stream",
  });
}

export type ExplanationsStartOk = {
  ok: true;
  stage1?: { externalJobId: string; totalModels: number };
  stage2?: { externalJobId: string; totalModels: number };
};

/** Start remote batch jobs for GradCAM/LIME on a finished (or cached) run. */
export async function serviceStartExplanations(
  userId: string,
  runId: string,
): Promise<ExplanationsStartOk | PipelineErr> {
  const run = await getPipelineRunForUser(runId, userId);
  if (!run) {
    return { ok: false, error: "Not found." };
  }
  if (run.status !== "finished") {
    return { ok: false, error: "Run must be finished before generating explanations." };
  }

  const file = await fetchRunImageAsFile(run);
  if (!file) {
    return { ok: false, error: "Stored image is missing for this run." };
  }

  const out: ExplanationsStartOk = { ok: true };

  if (run.stage1_status === "finished") {
    try {
      const batch = await startRemoteBatch({
        apiBaseUrl: getStage1ApiBaseUrl(),
        file,
        modelInputFeatureSize: STAGE1_MODEL_INPUT_SIZE,
        modelFilenames: STAGE1_MODEL_FILENAMES,
      });
      await setStage1ExternalJobIdForExplanations({
        runId: run.id,
        userId,
        externalJobId: batch.externalJobId,
      });
      out.stage1 = {
        externalJobId: batch.externalJobId,
        totalModels: batch.totalModels,
      };
    } catch (reason) {
      return { ok: false, error: runError(reason) };
    }
  }

  if (run.stage2_status === "finished") {
    try {
      const batch = await startRemoteBatch({
        apiBaseUrl: getStage2ApiBaseUrl(),
        file,
        modelInputFeatureSize: STAGE2_MODEL_INPUT_SIZE,
        modelFilenames: STAGE2_MODEL_FILENAMES,
      });
      await setStage2ExternalJobIdForExplanations({
        runId: run.id,
        userId,
        externalJobId: batch.externalJobId,
      });
      out.stage2 = {
        externalJobId: batch.externalJobId,
        totalModels: batch.totalModels,
      };
    } catch (reason) {
      return { ok: false, error: runError(reason) };
    }
  }

  if (!out.stage1 && !out.stage2) {
    return {
      ok: false,
      error: "No explanation stages are available for this run.",
    };
  }

  return out;
}

function processingRowFromRun(
  run: PredictionPipelineRunRow,
): ProcessingPipelineRunRow {
  return {
    id: run.id,
    created_at: run.created_at,
    updated_at: run.updated_at,
    original_filename: run.original_filename,
    image_object_key: run.image_object_key,
    stage1_status: run.stage1_status,
    stage2_status: run.stage2_status,
    stage3_status: run.stage3_status,
    stage1_external_job_id: run.stage1_external_job_id,
    stage2_external_job_id: run.stage2_external_job_id,
    stage3_external_job_id: run.stage3_external_job_id,
    stage3_model_filename: run.stage3_model_filename,
    skip_stage1_requested: run.skip_stage1_requested,
    skip_stage2_requested: run.skip_stage2_requested,
  };
}

async function probeProcessingRunStale(
  row: ProcessingPipelineRunRow,
): Promise<{ stale: boolean; reason: string | null }> {
  if (isRunStaleByAge(row, STALE_RUN_MS)) {
    return {
      stale: true,
      reason: "This run has not updated in over 45 minutes.",
    };
  }

  const active = activeStageFromRow(row);
  if (!active) {
    if (isAwaitingStage2StartRow(row) || isAwaitingStage3StartRow(row)) {
      return { stale: false, reason: null };
    }
    return {
      stale: true,
      reason: "Run is waiting in an unexpected state.",
    };
  }

  const jobId = externalJobIdForStage(row, active);
  if (!jobId) {
    return {
      stale: true,
      reason: "Active stage has no inference job id.",
    };
  }

  const base =
    active === 1
      ? getStage1ApiBaseUrl()
      : active === 2
        ? getStage2ApiBaseUrl()
        : getStage3ApiBaseUrl();
  try {
    await fetchRemoteJobStatus(base, jobId);
    return { stale: false, reason: null };
  } catch (reason) {
    const message = runError(reason);
    if (
      message.includes("404") ||
      message.includes("Job not found") ||
      message.includes("Not found.")
    ) {
      return {
        stale: true,
        reason: "Inference job no longer exists (service may have restarted).",
      };
    }
    if (message.includes("Could not reach helminth API")) {
      return {
        stale: true,
        reason: "Inference service is unreachable.",
      };
    }
    return { stale: false, reason: null };
  }
}

async function releaseStaleProcessingSlots(userId: string): Promise<number> {
  const rows = await listProcessingRunsForUser(userId);
  let released = 0;
  for (const row of rows) {
    const probe = await probeProcessingRunStale(row);
    if (!probe.stale) continue;
    await markPipelineRunCancelled({
      runId: row.id,
      userId,
      stage: activeStageFromRow(row) ?? undefined,
    });
    released += 1;
  }
  return released;
}

export type PipelineUnfinishedListOk = {
  ok: true;
  runs: UnfinishedRunItem[];
  count: number;
  limit: number;
  canStartNew: boolean;
};

export async function serviceListUnfinishedRuns(
  userId: string,
): Promise<PipelineUnfinishedListOk | PipelineErr> {
  try {
    const rows = await listProcessingRunsForUser(userId);
    const runs: UnfinishedRunItem[] = [];
    for (const row of rows) {
      const probe = await probeProcessingRunStale(row);
      runs.push(
        buildUnfinishedRunItem({
          row,
          stale: probe.stale,
          staleReason: probe.reason,
        }),
      );
    }
    return {
      ok: true,
      runs,
      count: runs.length,
      limit: MAX_CONCURRENT_PROCESSING,
      canStartNew: runs.length < MAX_CONCURRENT_PROCESSING,
    };
  } catch (reason) {
    return { ok: false, error: dbErrorMessage(reason) };
  }
}

export async function serviceCancelPipelineRun(
  userId: string,
  runId: string,
): Promise<{ ok: true } | PipelineErr> {
  const run = await getPipelineRunForUser(runId, userId);
  if (!run) {
    return { ok: false, error: "Not found." };
  }
  if (run.status !== "processing") {
    return { ok: false, error: "This run is no longer in progress." };
  }
  try {
    await markPipelineRunCancelled({
      runId,
      userId,
      stage: activeStage(run) ?? undefined,
    });
    return { ok: true };
  } catch (reason) {
    return { ok: false, error: dbErrorMessage(reason) };
  }
}

export async function serviceCancelStalePipelineRuns(
  userId: string,
): Promise<{ ok: true; cancelled: number } | PipelineErr> {
  try {
    const rows = await listProcessingRunsForUser(userId);
    let cancelled = 0;
    for (const row of rows) {
      const probe = await probeProcessingRunStale(row);
      if (!probe.stale) continue;
      await markPipelineRunCancelled({
        runId: row.id,
        userId,
        stage: activeStageFromRow(row) ?? undefined,
      });
      cancelled += 1;
    }
    return { ok: true, cancelled };
  } catch (reason) {
    return { ok: false, error: dbErrorMessage(reason) };
  }
}

async function restartStageInference(
  userId: string,
  run: PredictionPipelineRunRow,
  stage: StageNumber,
): Promise<
  | { ok: true; externalJobId: string; totalModels: number }
  | PipelineErr
> {
  const file = await fetchRunImageAsFile(run);
  if (!file) {
    return { ok: false, error: "Stored image is missing for this run." };
  }

  let batchConfig: ReturnType<typeof stageBatchConfig>;
  try {
    batchConfig = stageBatchConfig(
      stage,
      run.stage3_model_filename ?? undefined,
    );
  } catch (reason) {
    return { ok: false, error: runError(reason) };
  }

  let batch: BatchStartResult;
  try {
    batch = await startRemoteBatch({
      apiBaseUrl: batchConfig.apiBaseUrl,
      file,
      modelInputFeatureSize: batchConfig.modelInputFeatureSize,
      modelFilenames: batchConfig.modelFilenames,
    });
  } catch (reason) {
    const message = runError(reason);
    await markPipelineRunFailed({
      runId: run.id,
      userId,
      stage,
      message,
    });
    return { ok: false, error: message };
  }

  try {
    if (stage === 1) {
      await updateStage1ExternalJobId({
        runId: run.id,
        userId,
        externalJobId: batch.externalJobId,
      });
    } else if (stage === 2) {
      await updateStage2ExternalJobId({
        runId: run.id,
        userId,
        externalJobId: batch.externalJobId,
      });
    } else {
      await updateStage3ExternalJobId({
        runId: run.id,
        userId,
        externalJobId: batch.externalJobId,
        modelFilename: run.stage3_model_filename,
      });
    }
  } catch (reason) {
    return { ok: false, error: dbErrorMessage(reason) };
  }

  return {
    ok: true,
    externalJobId: batch.externalJobId,
    totalModels: batch.totalModels,
  };
}

export type PipelineResumeOk = {
  ok: true;
  id: string;
  resumeKind: "websocket" | "sync";
  stage: StageNumber | null;
  externalJobId?: string;
  totalModels?: number;
  sync?: PipelineSyncOk;
};

export async function serviceResumePipelineRun(
  userId: string,
  runId: string,
): Promise<PipelineResumeOk | PipelineErr> {
  const run = await getPipelineRunForUser(runId, userId);
  if (!run) {
    return { ok: false, error: "Not found." };
  }
  if (run.status !== "processing") {
    return { ok: false, error: "This run is no longer in progress." };
  }

  const proc = processingRowFromRun(run);
  const probe = await probeProcessingRunStale(proc);

  const sync = await serviceSyncPipelineRun(userId, runId);
  if (sync.ok && sync.runStatus === "finished") {
    return {
      ok: true,
      id: runId,
      resumeKind: "sync",
      stage: null,
      sync,
    };
  }

  if (sync.ok && (sync.awaitingStage2Start || sync.awaitingStage3Start)) {
    const file = await fetchRunImageAsFile(run);
    if (!file) {
      return { ok: false, error: "Stored image is missing for this run." };
    }
    if (sync.awaitingStage2Start) {
      const started = await serviceStartPipelineStage2(userId, runId, file);
      if (!started.ok) return started;
      return {
        ok: true,
        id: runId,
        resumeKind: "websocket",
        stage: 2,
        externalJobId: started.stage.externalJobId,
        totalModels: started.stage.totalModels,
        sync,
      };
    }
    const modelFilename =
      run.stage3_model_filename ?? DEFAULT_STAGE3_MODEL_FILENAME;
    const started = await serviceStartPipelineStage3(
      userId,
      runId,
      file,
      modelFilename,
    );
    if (!started.ok) return started;
    return {
      ok: true,
      id: runId,
      resumeKind: "websocket",
      stage: 3,
      externalJobId: started.stage.externalJobId,
      totalModels: started.stage.totalModels,
      sync,
    };
  }

  if (sync.ok && sync.persisted && sync.stage) {
    return {
      ok: true,
      id: runId,
      resumeKind: "sync",
      stage: sync.stage,
      sync,
    };
  }

  const existing = await buildSubmitResponseFromExistingRun(run);
  if (existing.ok && "stage" in existing && existing.stage) {
    return {
      ok: true,
      id: runId,
      resumeKind: "websocket",
      stage: existing.stage.stage,
      externalJobId: existing.stage.externalJobId,
      totalModels: existing.stage.totalModels,
    };
  }

  if (probe.stale) {
    const stage =
      activeStage(run) ??
      (shouldAwaitStage2Start(run)
        ? 2
        : shouldAwaitStage3Start(run)
          ? 3
          : null);
    if (!stage) {
      return {
        ok: false,
        error: "This run cannot be resumed. Try cancelling it instead.",
      };
    }
    const restarted = await restartStageInference(userId, run, stage);
    if (!restarted.ok) return restarted;
    return {
      ok: true,
      id: runId,
      resumeKind: "websocket",
      stage,
      externalJobId: restarted.externalJobId,
      totalModels: restarted.totalModels,
    };
  }

  if (shouldAwaitStage2Start(run)) {
    const file = await fetchRunImageAsFile(run);
    if (!file) {
      return { ok: false, error: "Stored image is missing for this run." };
    }
    const started = await serviceStartPipelineStage2(userId, runId, file);
    if (!started.ok) return started;
    return {
      ok: true,
      id: runId,
      resumeKind: "websocket",
      stage: 2,
      externalJobId: started.stage.externalJobId,
      totalModels: started.stage.totalModels,
    };
  }

  if (shouldAwaitStage3Start(run)) {
    const file = await fetchRunImageAsFile(run);
    if (!file) {
      return { ok: false, error: "Stored image is missing for this run." };
    }
    const modelFilename =
      run.stage3_model_filename ?? DEFAULT_STAGE3_MODEL_FILENAME;
    const started = await serviceStartPipelineStage3(
      userId,
      runId,
      file,
      modelFilename,
    );
    if (!started.ok) return started;
    return {
      ok: true,
      id: runId,
      resumeKind: "websocket",
      stage: 3,
      externalJobId: started.stage.externalJobId,
      totalModels: started.stage.totalModels,
    };
  }

  return {
    ok: false,
    error: "This run cannot be resumed. Try cancelling it instead.",
  };
}
