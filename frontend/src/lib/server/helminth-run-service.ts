import {
  HELMINTH_MODEL_FILENAMES,
  HELMINTH_MODEL_INPUT_SIZE,
  getStage2ApiBaseUrl,
} from "@/lib/helminth-config";
import { fetchRemoteJobStatus } from "@/lib/helminth-remote";
import type { HelminthPredictionRunRow } from "@/lib/prediction-db";
import {
  assertCanStartRun,
  getRunForUser,
  insertProcessingRun,
  listHistory,
  markRunFailed,
  markRunFinished,
  updateRunExternalJobId,
} from "@/lib/prediction-db";

const MAX_BYTES = 15 * 1024 * 1024;
const ALLOWED = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/tiff",
  "image/x-png",
]);

export type HelminthBatchOk = {
  ok: true;
  id: string;
  externalJobId: string;
  totalModels: number;
};

export type HelminthErr = { ok: false; error: string; code?: string };

export async function serviceSubmitHelminthBatch(
  userId: string,
  file: File,
): Promise<HelminthBatchOk | HelminthErr> {
  if (file.size === 0) {
    return { ok: false, error: "Empty file." };
  }
  if (file.size > MAX_BYTES) {
    return {
      ok: false,
      error: `File too large (max ${MAX_BYTES / (1024 * 1024)} MB).`,
    };
  }

  const mime = (file.type || "application/octet-stream").toLowerCase();
  if (!ALLOWED.has(mime)) {
    return {
      ok: false,
      error: "Unsupported image type. Use JPEG, PNG, WebP, or TIFF.",
    };
  }

  try {
    await assertCanStartRun(userId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Too many runs";
    return { ok: false, error: msg, code: "429" };
  }

  const runId = crypto.randomUUID();

  try {
    await insertProcessingRun({
      userId,
      runId,
      originalFilename: file.name || null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Database error";
    if (msg.includes("DATABASE_URL")) {
      return { ok: false, error: "Database is not configured (DATABASE_URL)." };
    }
    return { ok: false, error: msg };
  }

  const forward = new FormData();
  forward.set("modelInputFeatureSize", String(HELMINTH_MODEL_INPUT_SIZE));
  for (const name of HELMINTH_MODEL_FILENAMES) {
    forward.append("modelFilenames", name);
  }
  forward.set("image", file, file.name || "upload.jpg");

  const base = getStage2ApiBaseUrl();
  let remote: Response;
  try {
    remote = await fetch(`${base}/predict/batch`, {
      method: "POST",
      body: forward,
      cache: "no-store",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Network error";
    await markRunFailed({ runId, userId, message: msg });
    return { ok: false, error: `Could not reach helminth API: ${msg}` };
  }

  if (!remote.ok) {
    const detail = await remote.text();
    await markRunFailed({
      runId,
      userId,
      message: `Batch HTTP ${remote.status}: ${detail.slice(0, 500)}`,
    });
    return {
      ok: false,
      error: `Helminth API rejected the batch request (${remote.status}).`,
    };
  }

  const body = (await remote.json()) as {
    job_id?: string;
    total_models?: number;
  };
  if (!body.job_id) {
    await markRunFailed({
      runId,
      userId,
      message: "Helminth API returned no job_id.",
    });
    return { ok: false, error: "Invalid response from helminth API." };
  }

  try {
    await updateRunExternalJobId({
      runId,
      userId,
      externalJobId: body.job_id,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Database error";
    await markRunFailed({
      runId,
      userId,
      message: `Could not save job id: ${msg}`,
    });
    return { ok: false, error: "Could not save run after starting job." };
  }

  return {
    ok: true,
    id: runId,
    externalJobId: body.job_id,
    totalModels: body.total_models ?? HELMINTH_MODEL_FILENAMES.length,
  };
}

export async function serviceFinalizeHelminthRun(
  userId: string,
  runId: string,
): Promise<{ ok: true; idempotent?: boolean } | HelminthErr> {
  const run = await getRunForUser(runId, userId);
  if (!run) {
    return { ok: false, error: "Not found." };
  }

  if (run.status === "finished") {
    return { ok: true, idempotent: true };
  }

  if (!run.external_job_id) {
    return { ok: false, error: "Run has no external job id yet." };
  }

  let remote;
  try {
    remote = await fetchRemoteJobStatus(getStage2ApiBaseUrl(), run.external_job_id);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Status fetch failed";
    await markRunFailed({ runId, userId, message: msg });
    return { ok: false, error: msg };
  }

  if (remote.status !== "finished") {
    return { ok: false, error: "Job not finished yet." };
  }

  try {
    await markRunFinished({
      runId,
      userId,
      payload: remote,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Database error";
    await markRunFailed({ runId, userId, message: msg });
    return { ok: false, error: "Could not save results. Check database configuration." };
  }

  return { ok: true };
}

export async function serviceSyncHelminthRun(
  userId: string,
  runId: string,
): Promise<
  | {
      ok: true;
      persisted: boolean;
      remote: Record<string, unknown>;
    }
  | HelminthErr
> {
  const run = await getRunForUser(runId, userId);
  if (!run) {
    return { ok: false, error: "Not found." };
  }

  if (run.status === "finished" && run.result_payload) {
    return {
      ok: true,
      persisted: true,
      remote: run.result_payload as Record<string, unknown>,
    };
  }

  if (!run.external_job_id) {
    return { ok: false, error: "Run has no external job id yet." };
  }

  let remote;
  try {
    remote = await fetchRemoteJobStatus(getStage2ApiBaseUrl(), run.external_job_id);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Status fetch failed";
    return { ok: false, error: msg };
  }

  const remoteObj = remote as unknown as Record<string, unknown>;

  if (remote.status === "finished") {
    try {
      await markRunFinished({
        runId,
        userId,
        payload: remote,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Database error";
      return { ok: false, error: msg };
    }
    return { ok: true, persisted: true, remote: remoteObj };
  }

  return { ok: true, persisted: false, remote: remoteObj };
}

export async function serviceListHelminthHistory(
  userId: string,
  limit: number,
): Promise<{ ok: true; items: HelminthPredictionRunRow[] } | HelminthErr> {
  try {
    const items = await listHistory(userId, limit);
    return { ok: true, items };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Database error";
    if (msg.includes("DATABASE_URL")) {
      return { ok: false, error: "Database is not configured (DATABASE_URL)." };
    }
    return { ok: false, error: msg };
  }
}
