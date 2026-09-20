import type { PipelineOutcome } from "@/components/dashboard/pipeline-outcome-banner";

export type StageStatusLike =
  | "idle"
  | "active"
  | "complete"
  | "skipped"
  | "pending"
  | "processing"
  | "finished"
  | "failed";

export type VoteLike = {
  totalModels: number;
  positiveVotes: number;
  negativeVotes: number;
};

function isStageFinished(status: StageStatusLike | undefined): boolean {
  return status === "complete" || status === "finished";
}

function isStageSkipped(status: StageStatusLike | undefined): boolean {
  return status === "skipped";
}

export function resolvePipelineTerminalOutcome(params: {
  finalOutcome?: string | null;
  stage1Status?: StageStatusLike;
  stage2Status?: StageStatusLike;
  stage3Status?: StageStatusLike;
  stage1Vote?: VoteLike | null;
  stage2Vote?: VoteLike | null;
  detectionCount: number;
  skipStage1Requested?: boolean;
  skipStage2Requested?: boolean;
}): PipelineOutcome | null {
  const {
    finalOutcome,
    stage1Status,
    stage2Status,
    stage3Status,
    stage1Vote,
    stage2Vote,
    detectionCount,
    skipStage1Requested = false,
    skipStage2Requested = false,
  } = params;

  if (isStageFinished(stage3Status)) {
    return { kind: "stage3_complete", detectionCount };
  }

  const gateStopAtStage2 =
    finalOutcome === "helminth_negative" ||
    (isStageFinished(stage2Status) &&
      isStageSkipped(stage3Status) &&
      !skipStage2Requested);

  if (gateStopAtStage2 && stage2Vote) {
    return { kind: "stage2_no_helminth", vote: stage2Vote };
  }

  const gateStopAtStage1 =
    finalOutcome === "non_fecal" ||
    (isStageFinished(stage1Status) &&
      isStageSkipped(stage2Status) &&
      isStageSkipped(stage3Status) &&
      !skipStage2Requested &&
      !skipStage1Requested);

  if (gateStopAtStage1 && stage1Vote) {
    return { kind: "stage1_non_fecal", vote: stage1Vote };
  }

  return null;
}
