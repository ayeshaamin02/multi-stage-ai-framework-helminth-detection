import type { HelminthStatusPayload } from "@/lib/helminth-remote";
import type { VoteSummary } from "@/lib/pipeline-db";

/** Compact Stage 1/2 payload persisted in Postgres (vote summary is canonical). */
export type StageBinaryResultPayload = {
  schemaVersion: 1;
  results: Array<{
    modelFilename: string;
    classification: {
      predicted_class: number | null;
      max_prob: number | null;
    };
  }>;
  errorCount: number;
};

/** Compact Stage 3 payload — detections only, no embedded images. */
export type Stage3ResultPayload = {
  schemaVersion: 1;
  results: Array<{
    modelFilename: string;
    prediction?: {
      predictions?: Array<{
        class_id?: number;
        class_name?: string;
        confidence?: number;
        box?: number[];
      }>;
    };
    error?: string;
  }>;
  errorCount: number;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function readResultsArray(payload: unknown): unknown[] {
  const results = asRecord(payload).results;
  return Array.isArray(results) ? results : [];
}

/** Build a small Stage 1/2 JSON blob from the remote job + vote summary. */
export function trimStageBinaryResultPayload(
  remote: HelminthStatusPayload,
  voteSummary: VoteSummary,
): StageBinaryResultPayload {
  const errors = Array.isArray(remote.errors) ? remote.errors : [];
  return {
    schemaVersion: 1,
    results: voteSummary.modelVotes.map((vote) => ({
      modelFilename: vote.modelFilename,
      classification: {
        predicted_class: vote.predictedClass,
        max_prob: vote.maxProb,
      },
    })),
    errorCount: errors.length,
  };
}

/** Reconstruct the compact Stage 1/2 payload from a stored vote summary. */
export function compactBinaryPayloadFromVoteSummary(
  voteSummary: VoteSummary,
): StageBinaryResultPayload {
  return {
    schemaVersion: 1,
    results: voteSummary.modelVotes.map((vote) => ({
      modelFilename: vote.modelFilename,
      classification: {
        predicted_class: vote.predictedClass,
        max_prob: vote.maxProb,
      },
    })),
    errorCount: 0,
  };
}

/** Strip Stage 3 remote status down to detection rows only. */
export function trimStage3ResultPayload(
  remote: HelminthStatusPayload,
): Stage3ResultPayload {
  const rawResults = Array.isArray(remote.results) ? remote.results : [];
  const errors = Array.isArray(remote.errors) ? remote.errors : [];

  const results = rawResults.map((entry) => {
    const row = asRecord(entry);
    const modelFilename = String(row.modelFilename ?? "");
    const prediction = asRecord(row.prediction);
    const rawPreds = prediction.predictions;
    if (!Array.isArray(rawPreds)) {
      return { modelFilename, prediction: { predictions: [] as [] } };
    }

    const predictions = rawPreds
      .map((item) => {
        const pred = asRecord(item);
        const boxRaw = pred.box;
        if (!Array.isArray(boxRaw) || boxRaw.length < 4) return null;
        const box = boxRaw.slice(0, 4).map(Number);
        if (!box.every((n) => Number.isFinite(n))) return null;
        return {
          class_id: typeof pred.class_id === "number" ? pred.class_id : undefined,
          class_name:
            typeof pred.class_name === "string"
              ? pred.class_name
              : String(pred.class_name ?? "Unknown"),
          confidence: typeof pred.confidence === "number" ? pred.confidence : 0,
          box,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    return {
      modelFilename,
      prediction: { predictions },
    };
  });

  return {
    schemaVersion: 1,
    results,
    errorCount: errors.length,
  };
}

/** Minimal vote summary shape needed to rebuild Stage 1/2 preview rows. */
export type VoteSummaryPreviewInput = {
  modelVotes?: Array<{
    modelFilename: string;
    predictedClass: number | null;
    maxProb: number | null;
  }>;
};

/** Convert vote summary rows into preview-table shape for Stage 1/2 UI. */
export function voteSummaryToPreviewResults(
  voteSummary: VoteSummaryPreviewInput,
): unknown[] {
  const modelVotes = voteSummary.modelVotes ?? [];
  return modelVotes.map((vote) => ({
    modelFilename: vote.modelFilename,
    classification: {
      predicted_class: vote.predictedClass,
      max_prob: vote.maxProb,
    },
  }));
}

/** Pick the best available results array for predict/history preview (old + new rows). */
export function extractPreviewResultsFromStoredRun(params: {
  stage1ResultPayload?: unknown | null;
  stage2ResultPayload?: unknown | null;
  stage3ResultPayload?: unknown | null;
  stage1VoteSummary?: VoteSummaryPreviewInput | null;
  stage2VoteSummary?: VoteSummaryPreviewInput | null;
}): unknown[] {
  for (const payload of [
    params.stage3ResultPayload,
    params.stage2ResultPayload,
    params.stage1ResultPayload,
  ]) {
    const results = readResultsArray(payload);
    if (results.length > 0) return results;
  }

  if (params.stage2VoteSummary?.modelVotes?.length) {
    return voteSummaryToPreviewResults(params.stage2VoteSummary);
  }
  if (params.stage1VoteSummary?.modelVotes?.length) {
    return voteSummaryToPreviewResults(params.stage1VoteSummary);
  }
  return [];
}
