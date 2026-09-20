import { getSql } from "@/lib/db";
import {
  HELMINTH_MODEL_FILENAMES,
  HELMINTH_MODEL_INPUT_SIZE,
} from "@/lib/helminth-config";

export type RunStatus = "processing" | "finished" | "failed" | "timed_out";

export type HelminthPredictionRunRow = {
  id: string;
  user_id: string;
  created_at: string;
  updated_at: string;
  status: RunStatus;
  original_filename: string | null;
  external_job_id: string | null;
  model_filenames: unknown;
  model_input_size: number;
  result_payload: unknown | null;
  error_message: string | null;
};

const MAX_CONCURRENT_PROCESSING = 3;

export async function countProcessingRuns(userId: string): Promise<number> {
  const sql = getSql();
  const rows = await sql`
    SELECT COUNT(*)::int AS c
    FROM helminth_prediction_runs
    WHERE user_id = ${userId} AND status = 'processing'
  `;
  const row = rows[0] as { c: number } | undefined;
  return row?.c ?? 0;
}

export async function assertCanStartRun(userId: string): Promise<void> {
  const n = await countProcessingRuns(userId);
  if (n >= MAX_CONCURRENT_PROCESSING) {
    throw new Error("Too many runs in progress. Wait for one to finish.");
  }
}

export async function insertProcessingRun(params: {
  userId: string;
  runId: string;
  originalFilename: string | null;
}): Promise<void> {
  const sql = getSql();
  const modelJson = JSON.stringify([...HELMINTH_MODEL_FILENAMES]);
  await sql`
    INSERT INTO helminth_prediction_runs (
      id, user_id, status, original_filename, external_job_id,
      model_filenames, model_input_size
    ) VALUES (
      ${params.runId}::uuid,
      ${params.userId},
      'processing',
      ${params.originalFilename},
      NULL,
      ${modelJson}::jsonb,
      ${HELMINTH_MODEL_INPUT_SIZE}
    )
  `;
}

export async function updateRunExternalJobId(params: {
  runId: string;
  userId: string;
  externalJobId: string;
}): Promise<void> {
  const sql = getSql();
  await sql`
    UPDATE helminth_prediction_runs
    SET external_job_id = ${params.externalJobId}, updated_at = now()
    WHERE id = ${params.runId}::uuid AND user_id = ${params.userId}
  `;
}

export async function getRunForUser(
  runId: string,
  userId: string,
): Promise<HelminthPredictionRunRow | null> {
  const sql = getSql();
  const rows = await sql`
    SELECT id, user_id, created_at, updated_at, status, original_filename,
           external_job_id, model_filenames, model_input_size, result_payload, error_message
    FROM helminth_prediction_runs
    WHERE id = ${runId}::uuid AND user_id = ${userId}
    LIMIT 1
  `;
  return (rows[0] as HelminthPredictionRunRow | undefined) ?? null;
}

export async function markRunFailed(params: {
  runId: string;
  userId: string;
  message: string;
}): Promise<void> {
  const sql = getSql();
  await sql`
    UPDATE helminth_prediction_runs
    SET status = 'failed', error_message = ${params.message}, updated_at = now()
    WHERE id = ${params.runId}::uuid AND user_id = ${params.userId}
  `;
}

export async function markRunFinished(params: {
  runId: string;
  userId: string;
  payload: unknown;
}): Promise<void> {
  const sql = getSql();
  const json = JSON.stringify(params.payload);
  await sql`
    UPDATE helminth_prediction_runs
    SET status = 'finished',
        result_payload = ${json}::jsonb,
        error_message = NULL,
        updated_at = now()
    WHERE id = ${params.runId}::uuid AND user_id = ${params.userId}
  `;
}

export async function listHistory(
  userId: string,
  limit: number,
): Promise<HelminthPredictionRunRow[]> {
  const sql = getSql();
  const rows = await sql`
    SELECT id, user_id, created_at, updated_at, status, original_filename,
           external_job_id, model_filenames, model_input_size, result_payload, error_message
    FROM helminth_prediction_runs
    WHERE user_id = ${userId}
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
  return rows as HelminthPredictionRunRow[];
}

export async function getDashboardStats(userId: string): Promise<{
  totalPredictions: number;
  helminthPositivePhase2: number;
}> {
  const sql = getSql();
  const totalRows = await sql`
    SELECT COUNT(*)::int AS c
    FROM helminth_prediction_runs
    WHERE user_id = ${userId} AND status = 'finished'
  `;
  const totalPredictions =
    (totalRows[0] as { c: number } | undefined)?.c ?? 0;

  const posRows = await sql`
    SELECT COUNT(*)::int AS c
    FROM helminth_prediction_runs r
    WHERE r.user_id = ${userId}
      AND r.status = 'finished'
      AND r.result_payload IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM jsonb_array_elements(r.result_payload->'results') elem
        WHERE (elem->'classification'->>'predicted_class')::int = 1
      )
  `;
  const helminthPositivePhase2 =
    (posRows[0] as { c: number } | undefined)?.c ?? 0;

  return { totalPredictions, helminthPositivePhase2 };
}
