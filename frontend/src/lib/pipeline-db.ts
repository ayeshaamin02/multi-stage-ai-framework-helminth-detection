import { getSql } from "@/lib/db";
import { compactBinaryPayloadFromVoteSummary } from "@/lib/pipeline-result-payload";

export type PipelineRunStatus = "processing" | "finished" | "failed" | "timed_out";
export type StageRunStatus =
  | "pending"
  | "processing"
  | "finished"
  | "failed"
  | "skipped";

export type VoteSummary = {
  totalModels: number;
  positiveVotes: number;
  negativeVotes: number;
  majorityClass: 0 | 1;
  modelVotes: Array<{
    modelFilename: string;
    predictedClass: number | null;
    maxProb: number | null;
  }>;
};

export type GradcamArtifactEntry = {
  modelFilename: string;
  objectKey: string;
  createdAt: string;
};

export type LimeArtifactEntry = {
  modelFilename: string;
  objectKey: string;
  numSamples: number;
  createdAt: string;
};

export type PredictionPipelineRunRow = {
  id: string;
  user_id: string;
  created_at: string;
  updated_at: string;
  status: PipelineRunStatus;
  original_filename: string | null;
  image_object_key: string | null;
  stage1_status: StageRunStatus;
  stage2_status: StageRunStatus;
  stage3_status: StageRunStatus;
  stage1_external_job_id: string | null;
  stage2_external_job_id: string | null;
  stage3_external_job_id: string | null;
  stage1_result_payload: unknown | null;
  stage2_result_payload: unknown | null;
  stage3_result_payload: unknown | null;
  stage3_annotated_image_object_key: string | null;
  stage1_vote_summary: VoteSummary | null;
  stage2_vote_summary: VoteSummary | null;
  stage1_gradcam_artifacts: GradcamArtifactEntry[];
  stage1_lime_artifacts: LimeArtifactEntry[];
  stage2_gradcam_artifacts: GradcamArtifactEntry[];
  stage2_lime_artifacts: LimeArtifactEntry[];
  stage3_model_filename: string | null;
  stage3_lime_artifacts: LimeArtifactEntry[];
  final_outcome: string | null;
  error_message: string | null;
  image_hash: string | null;
  cache_hit: boolean;
  cache_source_run_id: string | null;
  skip_stage1_requested: boolean;
  skip_stage2_requested: boolean;
};

export type PredictionCacheSignatureRow = {
  image_hash: string;
  pipeline_version_key: string;
  stage1_result_payload: unknown | null;
  stage1_vote_summary: VoteSummary | null;
  stage2_result_payload: unknown | null;
  stage2_vote_summary: VoteSummary | null;
  stage3_result_payload: unknown | null;
  final_outcome: string;
  source_run_id: string | null;
  hit_count: number;
  created_at: string;
  last_hit_at: string | null;
};

const MAX_CONCURRENT_PROCESSING = 3;

export { MAX_CONCURRENT_PROCESSING };

/** Lightweight row for in-flight run recovery (no heavy JSONB payloads). */
export type ProcessingPipelineRunRow = {
  id: string;
  created_at: string;
  updated_at: string;
  original_filename: string | null;
  image_object_key: string | null;
  stage1_status: StageRunStatus;
  stage2_status: StageRunStatus;
  stage3_status: StageRunStatus;
  stage1_external_job_id: string | null;
  stage2_external_job_id: string | null;
  stage3_external_job_id: string | null;
  stage3_model_filename: string | null;
  skip_stage1_requested: boolean;
  skip_stage2_requested: boolean;
};

export async function countProcessingRuns(userId: string): Promise<number> {
  const sql = getSql();
  const rows = await sql`
    SELECT COUNT(*)::int AS c
    FROM prediction_pipeline_runs
    WHERE user_id = ${userId} AND status = 'processing'
  `;
  const row = rows[0] as { c: number } | undefined;
  return row?.c ?? 0;
}

export async function assertCanStartPipelineRun(userId: string): Promise<void> {
  const n = await countProcessingRuns(userId);
  if (n >= MAX_CONCURRENT_PROCESSING) {
    throw new Error("Too many runs in progress. Wait for one to finish.");
  }
}

export async function insertPipelineRun(params: {
  userId: string;
  runId: string;
  originalFilename: string | null;
  imageObjectKey?: string | null;
  imageHash?: string | null;
  stage1Status?: StageRunStatus;
  stage2Status?: StageRunStatus;
  stage3Status?: StageRunStatus;
  skipStage1Requested?: boolean;
  skipStage2Requested?: boolean;
}): Promise<void> {
  const sql = getSql();
  const stage1Status = params.stage1Status ?? "processing";
  const stage2Status = params.stage2Status ?? "pending";
  const stage3Status = params.stage3Status ?? "pending";
  await sql`
    INSERT INTO prediction_pipeline_runs (
      id, user_id, status, original_filename, image_object_key, image_hash,
      stage1_status, stage2_status, stage3_status,
      skip_stage1_requested, skip_stage2_requested
    ) VALUES (
      ${params.runId}::uuid,
      ${params.userId},
      'processing',
      ${params.originalFilename},
      ${params.imageObjectKey ?? null},
      ${params.imageHash ?? null},
      ${stage1Status},
      ${stage2Status},
      ${stage3Status},
      ${params.skipStage1Requested ?? false},
      ${params.skipStage2Requested ?? false}
    )
  `;
}

export async function updatePipelineRunImageObjectKey(params: {
  runId: string;
  userId: string;
  imageObjectKey: string;
  imageHash?: string | null;
}): Promise<void> {
  const sql = getSql();
  await sql`
    UPDATE prediction_pipeline_runs
    SET image_object_key = ${params.imageObjectKey},
        image_hash = COALESCE(${params.imageHash ?? null}, image_hash),
        updated_at = now()
    WHERE id = ${params.runId}::uuid AND user_id = ${params.userId}
  `;
}

export async function updateStage1ExternalJobId(params: {
  runId: string;
  userId: string;
  externalJobId: string;
}): Promise<void> {
  const sql = getSql();
  await sql`
    UPDATE prediction_pipeline_runs
    SET stage1_external_job_id = ${params.externalJobId},
        stage1_status = 'processing',
        updated_at = now()
    WHERE id = ${params.runId}::uuid AND user_id = ${params.userId}
  `;
}

/** Persist explanation batch job id without changing stage status (cached runs). */
export async function setStage1ExternalJobIdForExplanations(params: {
  runId: string;
  userId: string;
  externalJobId: string;
}): Promise<void> {
  const sql = getSql();
  await sql`
    UPDATE prediction_pipeline_runs
    SET stage1_external_job_id = ${params.externalJobId},
        updated_at = now()
    WHERE id = ${params.runId}::uuid AND user_id = ${params.userId}
  `;
}

export async function updateStage2ExternalJobId(params: {
  runId: string;
  userId: string;
  externalJobId: string;
}): Promise<void> {
  const sql = getSql();
  await sql`
    UPDATE prediction_pipeline_runs
    SET stage2_external_job_id = ${params.externalJobId},
        stage2_status = 'processing',
        updated_at = now()
    WHERE id = ${params.runId}::uuid AND user_id = ${params.userId}
  `;
}

export async function setStage2ExternalJobIdForExplanations(params: {
  runId: string;
  userId: string;
  externalJobId: string;
}): Promise<void> {
  const sql = getSql();
  await sql`
    UPDATE prediction_pipeline_runs
    SET stage2_external_job_id = ${params.externalJobId},
        updated_at = now()
    WHERE id = ${params.runId}::uuid AND user_id = ${params.userId}
  `;
}

export async function updateStage3ExternalJobId(params: {
  runId: string;
  userId: string;
  externalJobId: string;
  modelFilename?: string | null;
}): Promise<void> {
  const sql = getSql();
  await sql`
    UPDATE prediction_pipeline_runs
    SET stage3_external_job_id = ${params.externalJobId},
        stage3_model_filename = COALESCE(${params.modelFilename ?? null}, stage3_model_filename),
        stage3_status = 'processing',
        updated_at = now()
    WHERE id = ${params.runId}::uuid AND user_id = ${params.userId}
  `;
}

export async function saveStage1Result(params: {
  runId: string;
  userId: string;
  payload: unknown;
  voteSummary: VoteSummary;
  isFecal: boolean;
  /** User chose to skip Stage 2 — always advance to Stage 3 after Stage 1. */
  userSkippedStage2?: boolean;
}): Promise<void> {
  const sql = getSql();
  const payloadJson = JSON.stringify(params.payload);
  const voteSummaryJson = JSON.stringify(params.voteSummary);
  if (params.userSkippedStage2) {
    await sql`
      UPDATE prediction_pipeline_runs
      SET status = 'processing',
          stage1_status = 'finished',
          stage1_result_payload = ${payloadJson}::jsonb,
          stage1_vote_summary = ${voteSummaryJson}::jsonb,
          stage2_status = 'skipped',
          stage3_status = 'pending',
          error_message = NULL,
          updated_at = now()
      WHERE id = ${params.runId}::uuid AND user_id = ${params.userId}
    `;
    return;
  }
  if (params.isFecal) {
    await sql`
      UPDATE prediction_pipeline_runs
      SET stage1_status = 'finished',
          stage1_result_payload = ${payloadJson}::jsonb,
          stage1_vote_summary = ${voteSummaryJson}::jsonb,
          stage2_status = 'pending',
          stage3_status = 'pending',
          updated_at = now()
      WHERE id = ${params.runId}::uuid AND user_id = ${params.userId}
    `;
    return;
  }

  await sql`
    UPDATE prediction_pipeline_runs
    SET status = 'finished',
        stage1_status = 'finished',
        stage2_status = 'skipped',
        stage3_status = 'skipped',
        stage1_result_payload = ${payloadJson}::jsonb,
        stage1_vote_summary = ${voteSummaryJson}::jsonb,
        final_outcome = 'non_fecal',
        error_message = NULL,
        updated_at = now()
    WHERE id = ${params.runId}::uuid AND user_id = ${params.userId}
  `;
}

export async function saveStage2Result(params: {
  runId: string;
  userId: string;
  payload: unknown;
  voteSummary: VoteSummary;
  finalOutcome: "helminth_positive" | "helminth_negative";
  /** When true, run stays `processing` and Stage 3 is started by the client. */
  awaitStage3: boolean;
}): Promise<void> {
  const sql = getSql();
  const payloadJson = JSON.stringify(params.payload);
  const voteSummaryJson = JSON.stringify(params.voteSummary);
  if (params.awaitStage3) {
    await sql`
      UPDATE prediction_pipeline_runs
      SET status = 'processing',
          stage2_status = 'finished',
          stage2_result_payload = ${payloadJson}::jsonb,
          stage2_vote_summary = ${voteSummaryJson}::jsonb,
          final_outcome = ${params.finalOutcome},
          stage3_status = 'pending',
          error_message = NULL,
          updated_at = now()
      WHERE id = ${params.runId}::uuid AND user_id = ${params.userId}
    `;
    return;
  }
  await sql`
    UPDATE prediction_pipeline_runs
    SET status = 'finished',
        stage2_status = 'finished',
        stage2_result_payload = ${payloadJson}::jsonb,
        stage2_vote_summary = ${voteSummaryJson}::jsonb,
        final_outcome = ${params.finalOutcome},
        stage3_status = 'skipped',
        error_message = NULL,
        updated_at = now()
    WHERE id = ${params.runId}::uuid AND user_id = ${params.userId}
  `;
}

export async function saveStage3Result(params: {
  runId: string;
  userId: string;
  payload: unknown;
  annotatedImageObjectKey?: string | null;
}): Promise<void> {
  const sql = getSql();
  const payloadJson = JSON.stringify(params.payload);
  const annotatedKey = params.annotatedImageObjectKey ?? null;
  await sql`
    UPDATE prediction_pipeline_runs
    SET status = 'finished',
        stage3_status = 'finished',
        stage3_result_payload = ${payloadJson}::jsonb,
        stage3_annotated_image_object_key = ${annotatedKey},
        final_outcome = COALESCE(final_outcome, 'helminth_positive'),
        error_message = NULL,
        updated_at = now()
    WHERE id = ${params.runId}::uuid AND user_id = ${params.userId}
  `;
}

export async function listProcessingRunsForUser(
  userId: string,
): Promise<ProcessingPipelineRunRow[]> {
  const sql = getSql();
  const rows = await sql`
    SELECT id, created_at, updated_at, original_filename, image_object_key,
           stage1_status, stage2_status, stage3_status,
           stage1_external_job_id, stage2_external_job_id, stage3_external_job_id,
           stage3_model_filename,
           COALESCE(skip_stage1_requested, false) AS skip_stage1_requested,
           COALESCE(skip_stage2_requested, false) AS skip_stage2_requested
    FROM prediction_pipeline_runs
    WHERE user_id = ${userId} AND status = 'processing'
    ORDER BY updated_at DESC
  `;
  return rows as ProcessingPipelineRunRow[];
}

export async function markPipelineRunCancelled(params: {
  runId: string;
  userId: string;
  stage?: 1 | 2 | 3;
}): Promise<void> {
  await markPipelineRunFailed({
    runId: params.runId,
    userId: params.userId,
    stage: params.stage,
    message: "Cancelled by user.",
  });
}

export async function markPipelineRunFailed(params: {
  runId: string;
  userId: string;
  message: string;
  stage?: 1 | 2 | 3;
}): Promise<void> {
  const sql = getSql();
  const stageStatus =
    params.stage === 1
      ? sql`stage1_status = 'failed',`
      : params.stage === 2
        ? sql`stage2_status = 'failed',`
        : params.stage === 3
          ? sql`stage3_status = 'failed',`
          : sql``;
  await sql`
    UPDATE prediction_pipeline_runs
    SET status = 'failed',
        ${stageStatus}
        error_message = ${params.message},
        updated_at = now()
    WHERE id = ${params.runId}::uuid AND user_id = ${params.userId}
  `;
}

export async function getPipelineRunForUser(
  runId: string,
  userId: string,
): Promise<PredictionPipelineRunRow | null> {
  const sql = getSql();
  const rows = await sql`
    SELECT id, user_id, created_at, updated_at, status, original_filename,
           image_object_key,
           stage1_status, stage2_status, stage3_status,
           stage1_external_job_id, stage2_external_job_id, stage3_external_job_id,
           stage1_result_payload, stage2_result_payload, stage3_result_payload,
           stage3_annotated_image_object_key,
           stage1_vote_summary, stage2_vote_summary,
           COALESCE(stage1_gradcam_artifacts, '[]'::jsonb) AS stage1_gradcam_artifacts,
           COALESCE(stage1_lime_artifacts,    '[]'::jsonb) AS stage1_lime_artifacts,
           COALESCE(stage2_gradcam_artifacts, '[]'::jsonb) AS stage2_gradcam_artifacts,
           COALESCE(stage2_lime_artifacts,    '[]'::jsonb) AS stage2_lime_artifacts,
           stage3_model_filename,
           COALESCE(stage3_lime_artifacts,    '[]'::jsonb) AS stage3_lime_artifacts,
           final_outcome, error_message,
           image_hash,
           COALESCE(cache_hit, false) AS cache_hit,
           cache_source_run_id,
           COALESCE(skip_stage1_requested, false) AS skip_stage1_requested,
           COALESCE(skip_stage2_requested, false) AS skip_stage2_requested
    FROM prediction_pipeline_runs
    WHERE id = ${runId}::uuid AND user_id = ${userId}
    LIMIT 1
  `;
  return (rows[0] as PredictionPipelineRunRow | undefined) ?? null;
}

/** Internal: load any run by id (cache copy, no user filter). */
export async function getPipelineRunById(
  runId: string,
): Promise<PredictionPipelineRunRow | null> {
  const sql = getSql();
  const rows = await sql`
    SELECT id, user_id, created_at, updated_at, status, original_filename,
           image_object_key,
           stage1_status, stage2_status, stage3_status,
           stage1_external_job_id, stage2_external_job_id, stage3_external_job_id,
           stage1_result_payload, stage2_result_payload, stage3_result_payload,
           stage3_annotated_image_object_key,
           stage1_vote_summary, stage2_vote_summary,
           COALESCE(stage1_gradcam_artifacts, '[]'::jsonb) AS stage1_gradcam_artifacts,
           COALESCE(stage1_lime_artifacts,    '[]'::jsonb) AS stage1_lime_artifacts,
           COALESCE(stage2_gradcam_artifacts, '[]'::jsonb) AS stage2_gradcam_artifacts,
           COALESCE(stage2_lime_artifacts,    '[]'::jsonb) AS stage2_lime_artifacts,
           stage3_model_filename,
           COALESCE(stage3_lime_artifacts,    '[]'::jsonb) AS stage3_lime_artifacts,
           final_outcome, error_message,
           image_hash,
           COALESCE(cache_hit, false) AS cache_hit,
           cache_source_run_id,
           COALESCE(skip_stage1_requested, false) AS skip_stage1_requested,
           COALESCE(skip_stage2_requested, false) AS skip_stage2_requested
    FROM prediction_pipeline_runs
    WHERE id = ${runId}::uuid
    LIMIT 1
  `;
  return (rows[0] as PredictionPipelineRunRow | undefined) ?? null;
}

export async function listPipelineHistory(
  userId: string,
  limit: number,
  offset = 0,
): Promise<PredictionPipelineRunRow[]> {
  const sql = getSql();
  const rows = await sql`
    SELECT id, user_id, created_at, updated_at, status, original_filename,
           image_object_key,
           stage1_status, stage2_status, stage3_status,
           stage1_external_job_id, stage2_external_job_id, stage3_external_job_id,
           stage1_result_payload, stage2_result_payload, stage3_result_payload,
           stage3_annotated_image_object_key,
           stage1_vote_summary, stage2_vote_summary,
           COALESCE(stage1_gradcam_artifacts, '[]'::jsonb) AS stage1_gradcam_artifacts,
           COALESCE(stage1_lime_artifacts,    '[]'::jsonb) AS stage1_lime_artifacts,
           COALESCE(stage2_gradcam_artifacts, '[]'::jsonb) AS stage2_gradcam_artifacts,
           COALESCE(stage2_lime_artifacts,    '[]'::jsonb) AS stage2_lime_artifacts,
           stage3_model_filename,
           COALESCE(stage3_lime_artifacts,    '[]'::jsonb) AS stage3_lime_artifacts,
           final_outcome, error_message,
           image_hash,
           COALESCE(cache_hit, false) AS cache_hit,
           cache_source_run_id,
           COALESCE(skip_stage1_requested, false) AS skip_stage1_requested,
           COALESCE(skip_stage2_requested, false) AS skip_stage2_requested
    FROM prediction_pipeline_runs
    WHERE user_id = ${userId}
    ORDER BY created_at DESC
    LIMIT ${limit}
    OFFSET ${offset}
  `;
  return rows as PredictionPipelineRunRow[];
}

/**
 * Append an explanation artifact entry to the appropriate per-stage JSONB array.
 * GradCAM entries are de-duplicated by `objectKey` (so re-uploads on the same
 * deterministic model slug do not bloat the array).
 */
export async function appendStageExplanationArtifact(params: {
  runId: string;
  userId: string;
  stage: 1 | 2 | 3;
  kind: "gradcam" | "lime";
  entry: GradcamArtifactEntry | LimeArtifactEntry;
}): Promise<void> {
  const sql = getSql();
  const entryJson = JSON.stringify(params.entry);
  if (params.stage === 1 && params.kind === "gradcam") {
    await sql`
      UPDATE prediction_pipeline_runs
      SET stage1_gradcam_artifacts = (
            SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
            FROM jsonb_array_elements(COALESCE(stage1_gradcam_artifacts, '[]'::jsonb)) AS elem
            WHERE elem->>'objectKey' <> ${params.entry.objectKey}
          ) || ${entryJson}::jsonb,
          updated_at = now()
      WHERE id = ${params.runId}::uuid AND user_id = ${params.userId}
    `;
    return;
  }
  if (params.stage === 1 && params.kind === "lime") {
    await sql`
      UPDATE prediction_pipeline_runs
      SET stage1_lime_artifacts = COALESCE(stage1_lime_artifacts, '[]'::jsonb) || ${entryJson}::jsonb,
          updated_at = now()
      WHERE id = ${params.runId}::uuid AND user_id = ${params.userId}
    `;
    return;
  }
  if (params.stage === 2 && params.kind === "gradcam") {
    await sql`
      UPDATE prediction_pipeline_runs
      SET stage2_gradcam_artifacts = (
            SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
            FROM jsonb_array_elements(COALESCE(stage2_gradcam_artifacts, '[]'::jsonb)) AS elem
            WHERE elem->>'objectKey' <> ${params.entry.objectKey}
          ) || ${entryJson}::jsonb,
          updated_at = now()
      WHERE id = ${params.runId}::uuid AND user_id = ${params.userId}
    `;
    return;
  }
  if (params.stage === 2 && params.kind === "lime") {
    await sql`
      UPDATE prediction_pipeline_runs
      SET stage2_lime_artifacts = COALESCE(stage2_lime_artifacts, '[]'::jsonb) || ${entryJson}::jsonb,
          updated_at = now()
      WHERE id = ${params.runId}::uuid AND user_id = ${params.userId}
    `;
    return;
  }
  if (params.stage === 3 && params.kind === "lime") {
    await sql`
      UPDATE prediction_pipeline_runs
      SET stage3_lime_artifacts = COALESCE(stage3_lime_artifacts, '[]'::jsonb) || ${entryJson}::jsonb,
          updated_at = now()
      WHERE id = ${params.runId}::uuid AND user_id = ${params.userId}
    `;
    return;
  }
  throw new Error(`Unsupported explanation artifact: stage ${params.stage} kind ${params.kind}`);
}

export function stageStatusesFromFinalOutcome(finalOutcome: string): {
  stage1: StageRunStatus;
  stage2: StageRunStatus;
  stage3: StageRunStatus;
} {
  if (finalOutcome === "non_fecal") {
    return { stage1: "finished", stage2: "skipped", stage3: "skipped" };
  }
  if (finalOutcome === "helminth_negative") {
    return { stage1: "finished", stage2: "finished", stage3: "skipped" };
  }
  return { stage1: "finished", stage2: "finished", stage3: "finished" };
}

export async function findCacheSignature(
  imageHash: string,
  pipelineVersionKey: string,
): Promise<PredictionCacheSignatureRow | null> {
  const sql = getSql();
  const rows = await sql`
    SELECT image_hash, pipeline_version_key,
           stage1_result_payload, stage1_vote_summary,
           stage2_result_payload, stage2_vote_summary,
           stage3_result_payload, final_outcome, source_run_id,
           hit_count, created_at, last_hit_at
    FROM prediction_cache_signatures
    WHERE image_hash = ${imageHash}
      AND pipeline_version_key = ${pipelineVersionKey}
    LIMIT 1
  `;
  return (rows[0] as PredictionCacheSignatureRow | undefined) ?? null;
}

export async function recordCacheSignatureHit(
  imageHash: string,
  pipelineVersionKey: string,
): Promise<void> {
  const sql = getSql();
  await sql`
    UPDATE prediction_cache_signatures
    SET hit_count = hit_count + 1,
        last_hit_at = now()
    WHERE image_hash = ${imageHash}
      AND pipeline_version_key = ${pipelineVersionKey}
  `;
}

export async function upsertCacheSignature(params: {
  imageHash: string;
  pipelineVersionKey: string;
  stage1VoteSummary: VoteSummary | null;
  stage2VoteSummary: VoteSummary | null;
  stage3ResultPayload: unknown | null;
  finalOutcome: string;
  sourceRunId: string;
}): Promise<void> {
  const sql = getSql();
  const s1v = params.stage1VoteSummary
    ? JSON.stringify(params.stage1VoteSummary)
    : null;
  const s2v = params.stage2VoteSummary
    ? JSON.stringify(params.stage2VoteSummary)
    : null;
  const s3 = params.stage3ResultPayload
    ? JSON.stringify(params.stage3ResultPayload)
    : null;

  await sql`
    INSERT INTO prediction_cache_signatures (
      image_hash, pipeline_version_key,
      stage1_result_payload, stage1_vote_summary,
      stage2_result_payload, stage2_vote_summary,
      stage3_result_payload, final_outcome, source_run_id
    ) VALUES (
      ${params.imageHash},
      ${params.pipelineVersionKey},
      NULL,
      ${s1v}::jsonb,
      NULL,
      ${s2v}::jsonb,
      ${s3}::jsonb,
      ${params.finalOutcome},
      ${params.sourceRunId}::uuid
    )
    ON CONFLICT (image_hash, pipeline_version_key) DO UPDATE SET
      stage1_result_payload = NULL,
      stage1_vote_summary = EXCLUDED.stage1_vote_summary,
      stage2_result_payload = NULL,
      stage2_vote_summary = EXCLUDED.stage2_vote_summary,
      stage3_result_payload = EXCLUDED.stage3_result_payload,
      final_outcome = EXCLUDED.final_outcome,
      source_run_id = EXCLUDED.source_run_id
  `;
}

export async function insertCachedPipelineRun(params: {
  userId: string;
  runId: string;
  originalFilename: string | null;
  imageObjectKey: string;
  imageHash: string;
  cacheSourceRunId: string | null;
  signature: PredictionCacheSignatureRow;
  stage3AnnotatedImageObjectKey?: string | null;
}): Promise<void> {
  const sql = getSql();
  const stages = stageStatusesFromFinalOutcome(params.signature.final_outcome);
  const s1 =
    params.signature.stage1_result_payload != null
      ? JSON.stringify(params.signature.stage1_result_payload)
      : params.signature.stage1_vote_summary
        ? JSON.stringify(
            compactBinaryPayloadFromVoteSummary(params.signature.stage1_vote_summary),
          )
        : null;
  const s1v = params.signature.stage1_vote_summary
    ? JSON.stringify(params.signature.stage1_vote_summary)
    : null;
  const s2 =
    params.signature.stage2_result_payload != null
      ? JSON.stringify(params.signature.stage2_result_payload)
      : params.signature.stage2_vote_summary
        ? JSON.stringify(
            compactBinaryPayloadFromVoteSummary(params.signature.stage2_vote_summary),
          )
        : null;
  const s2v = params.signature.stage2_vote_summary
    ? JSON.stringify(params.signature.stage2_vote_summary)
    : null;
  const s3 = params.signature.stage3_result_payload
    ? JSON.stringify(params.signature.stage3_result_payload)
    : null;

  await sql`
    INSERT INTO prediction_pipeline_runs (
      id, user_id, status, original_filename, image_object_key, image_hash,
      cache_hit, cache_source_run_id,
      stage1_status, stage2_status, stage3_status,
      stage1_result_payload, stage1_vote_summary,
      stage2_result_payload, stage2_vote_summary,
      stage3_result_payload, stage3_annotated_image_object_key,
      final_outcome,
      skip_stage1_requested, skip_stage2_requested
    ) VALUES (
      ${params.runId}::uuid,
      ${params.userId},
      'finished',
      ${params.originalFilename},
      ${params.imageObjectKey},
      ${params.imageHash},
      true,
      ${params.cacheSourceRunId}::uuid,
      ${stages.stage1},
      ${stages.stage2},
      ${stages.stage3},
      ${s1}::jsonb,
      ${s1v}::jsonb,
      ${s2}::jsonb,
      ${s2v}::jsonb,
      ${s3}::jsonb,
      ${params.stage3AnnotatedImageObjectKey ?? null},
      ${params.signature.final_outcome},
      false,
      false
    )
  `;
}

const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

export async function findIdempotencyRun(
  userId: string,
  key: string,
): Promise<string | null> {
  const sql = getSql();
  const rows = await sql`
    SELECT run_id, created_at
    FROM prediction_idempotency_keys
    WHERE user_id = ${userId} AND key = ${key}
    LIMIT 1
  `;
  const row = rows[0] as { run_id: string; created_at: string } | undefined;
  if (!row) return null;
  const age = Date.now() - Date.parse(row.created_at);
  if (!Number.isFinite(age) || age > IDEMPOTENCY_TTL_MS) {
    await sql`
      DELETE FROM prediction_idempotency_keys
      WHERE user_id = ${userId} AND key = ${key}
    `;
    return null;
  }
  return row.run_id;
}

export async function insertIdempotencyKey(params: {
  userId: string;
  key: string;
  runId: string;
}): Promise<void> {
  const sql = getSql();
  await sql`
    INSERT INTO prediction_idempotency_keys (user_id, key, run_id)
    VALUES (${params.userId}, ${params.key}, ${params.runId}::uuid)
    ON CONFLICT (user_id, key) DO UPDATE SET
      run_id = EXCLUDED.run_id,
      created_at = now()
  `;
}

export async function getPipelineDashboardStats(userId: string): Promise<{
  totalPredictions: number;
  fecalDetectedStage1: number;
  helminthPositivePhase2: number;
  speciesDetectionsCount: number;
}> {
  const sql = getSql();
  const totalRows = await sql`
    SELECT COUNT(*)::int AS c
    FROM prediction_pipeline_runs
    WHERE user_id = ${userId} AND status = 'finished'
  `;
  const totalPredictions = (totalRows[0] as { c: number } | undefined)?.c ?? 0;

  const fecalRows = await sql`
    SELECT COUNT(*)::int AS c
    FROM prediction_pipeline_runs
    WHERE user_id = ${userId}
      AND status = 'finished'
      AND stage1_status = 'finished'
      AND stage1_vote_summary->>'majorityClass' = '0'
  `;
  const fecalDetectedStage1 =
    (fecalRows[0] as { c: number } | undefined)?.c ?? 0;

  const posRows = await sql`
    SELECT COUNT(*)::int AS c
    FROM prediction_pipeline_runs
    WHERE user_id = ${userId}
      AND status = 'finished'
      AND final_outcome = 'helminth_positive'
  `;
  const helminthPositivePhase2 =
    (posRows[0] as { c: number } | undefined)?.c ?? 0;

  const speciesRows = await sql`
    SELECT COALESCE(SUM(run_detections), 0)::int AS c
    FROM (
      SELECT (
        SELECT COALESCE(SUM(
          CASE
            WHEN jsonb_typeof(e->'prediction'->'predictions') = 'array'
            THEN jsonb_array_length(e->'prediction'->'predictions')
            ELSE 0
          END
        ), 0)
        FROM jsonb_array_elements(
          COALESCE(p.stage3_result_payload->'results', '[]'::jsonb)
        ) AS e
      ) AS run_detections
      FROM prediction_pipeline_runs p
      WHERE p.user_id = ${userId}
        AND p.status = 'finished'
        AND p.stage3_status = 'finished'
    ) t
  `;
  const speciesDetectionsCount =
    (speciesRows[0] as { c: number } | undefined)?.c ?? 0;

  return {
    totalPredictions,
    fecalDetectedStage1,
    helminthPositivePhase2,
    speciesDetectionsCount,
  };
}
