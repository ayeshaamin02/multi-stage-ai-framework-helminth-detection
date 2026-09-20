import type { PredictionPipelineRunRow } from "@/lib/pipeline-db";

/** Human-readable single-sentence summary of a pipeline run row. */
export function summarizePipelineRun(row: PredictionPipelineRunRow): string {
  if (row.status === "failed") return row.error_message || "Failed";
  if (row.stage2_status === "skipped") {
    const vote = row.stage1_vote_summary as
      | { positiveVotes?: number; negativeVotes?: number }
      | null;
    return `Stage 1 result: Non fecal (${vote?.positiveVotes ?? 0} fecal votes / ${vote?.negativeVotes ?? 0} non fecal votes). Stage 2 skipped.`;
  }
  if (row.stage2_vote_summary) {
    const vote = row.stage2_vote_summary as
      | {
          positiveVotes?: number;
          negativeVotes?: number;
          majorityClass?: number;
        }
      | null;
    const label =
      vote?.majorityClass === 0
        ? "Helminth detected"
        : vote?.majorityClass === 1
          ? "No helminth"
          : "Unknown";
    const stage3Tail =
      row.stage3_status === "finished"
        ? " Stage 3 species localization complete."
        : row.stage3_status === "skipped" && vote?.majorityClass === 1
          ? " Stage 3 skipped (no helminth)."
          : "";
    return `Stage 2 result: ${label} (${vote?.positiveVotes ?? 0} Helminth votes / ${vote?.negativeVotes ?? 0} Non Helminth votes).${stage3Tail}`;
  }
  if (row.stage1_vote_summary) {
    const vote = row.stage1_vote_summary as
      | {
          majorityClass?: number;
          positiveVotes?: number;
          negativeVotes?: number;
        }
      | null;
    const label =
      vote?.majorityClass === 0
        ? "Fecal"
        : vote?.majorityClass === 1
          ? "Non fecal"
          : "Unknown";
    return `Stage 1 result: ${label} (${vote?.positiveVotes ?? 0} fecal votes / ${vote?.negativeVotes ?? 0} non fecal votes).`;
  }
  return row.status;
}

/** Strip directory prefix and common model file extensions from a model filename. */
export function shortModelName(filename: string): string {
  const base = filename.split("/").pop() ?? filename;
  return base.replace(/\.(keras|h5|pb|onnx|tflite|savedmodel)$/i, "");
}
