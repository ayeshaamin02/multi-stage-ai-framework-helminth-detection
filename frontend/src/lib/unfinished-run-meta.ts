import type {
  ProcessingPipelineRunRow,
  StageRunStatus,
} from "@/lib/pipeline-db";

export type UnfinishedRunItem = {
  id: string;
  originalFilename: string | null;
  createdAt: string;
  updatedAt: string;
  activeStage: 1 | 2 | 3 | null;
  phaseLabel: string;
  stage1Status: StageRunStatus;
  stage2Status: StageRunStatus;
  stage3Status: StageRunStatus;
  externalJobId: string | null;
  resumable: boolean;
  stale: boolean;
  staleReason: string | null;
};

export function activeStageFromRow(
  row: Pick<
    ProcessingPipelineRunRow,
    "stage1_status" | "stage2_status" | "stage3_status"
  >,
): 1 | 2 | 3 | null {
  if (row.stage3_status === "processing") return 3;
  if (row.stage2_status === "processing") return 2;
  if (row.stage1_status === "processing") return 1;
  return null;
}

export function externalJobIdForStage(
  row: ProcessingPipelineRunRow,
  stage: 1 | 2 | 3,
): string | null {
  if (stage === 1) return row.stage1_external_job_id;
  if (stage === 2) return row.stage2_external_job_id;
  return row.stage3_external_job_id;
}

export function phaseLabelForRun(row: ProcessingPipelineRunRow): string {
  const active = activeStageFromRow(row);
  if (active === 1) return "Stage 1 · Running";
  if (active === 2) return "Stage 2 · Running";
  if (active === 3) return "Stage 3 · Running";
  if (row.stage2_status === "pending" && row.stage1_status === "finished") {
    return "Stage 2 · Waiting to start";
  }
  if (row.stage3_status === "pending") {
    if (row.stage2_status === "finished") {
      return "Stage 3 · Waiting to start";
    }
    if (row.stage2_status === "skipped") {
      return "Stage 3 · Waiting to start";
    }
  }
  if (row.stage1_status === "processing") return "Stage 1 · Running";
  return "Pipeline · In progress";
}

export function isAwaitingStage2Start(row: ProcessingPipelineRunRow): boolean {
  return (
    row.stage1_status === "finished" &&
    row.stage2_status === "pending" &&
    !row.skip_stage2_requested
  );
}

export function isAwaitingStage3Start(row: ProcessingPipelineRunRow): boolean {
  if (row.stage3_status !== "pending") return false;
  if (row.stage2_status === "finished") return true;
  return (
    row.skip_stage2_requested &&
    (row.stage1_status === "finished" || row.stage1_status === "skipped")
  );
}

export function isRunResumable(row: ProcessingPipelineRunRow): boolean {
  const active = activeStageFromRow(row);
  if (active !== null) {
    const jobId = externalJobIdForStage(row, active);
    if (jobId) return true;
    return Boolean(row.image_object_key);
  }
  if (isAwaitingStage2Start(row) || isAwaitingStage3Start(row)) {
    return Boolean(row.image_object_key);
  }
  return Boolean(row.image_object_key);
}

export function isRunStaleByAge(
  row: ProcessingPipelineRunRow,
  staleMs: number,
): boolean {
  const updated = Date.parse(row.updated_at);
  if (!Number.isFinite(updated)) return false;
  return Date.now() - updated >= staleMs;
}

export function buildUnfinishedRunItem(params: {
  row: ProcessingPipelineRunRow;
  stale: boolean;
  staleReason: string | null;
}): UnfinishedRunItem {
  const active = activeStageFromRow(params.row);
  return {
    id: params.row.id,
    originalFilename: params.row.original_filename,
    createdAt: params.row.created_at,
    updatedAt: params.row.updated_at,
    activeStage: active,
    phaseLabel: phaseLabelForRun(params.row),
    stage1Status: params.row.stage1_status,
    stage2Status: params.row.stage2_status,
    stage3Status: params.row.stage3_status,
    externalJobId: active ? externalJobIdForStage(params.row, active) : null,
    resumable: isRunResumable(params.row),
    stale: params.stale,
    staleReason: params.staleReason,
  };
}
