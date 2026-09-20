/**
 * Stage-agnostic WebSocket payload normalizers for GradCAM and LIME
 * explanations. Both Stage 1 and Stage 2 model hosts emit the same shape;
 * callers pass the relevant `modelFilenames` whitelist so payloads referencing
 * unknown models are dropped instead of being misattributed.
 */

type LooseRecord = Record<string, unknown>;

function asRecord(v: unknown): LooseRecord | null {
  return v !== null && typeof v === "object" ? (v as LooseRecord) : null;
}

/** Map an API-supplied model filename to the canonical entry in `modelFilenames`. */
export function resolveModelFilenameKey(
  raw: string | undefined | null,
  modelFilenames: readonly string[],
): string | null {
  if (raw == null || typeof raw !== "string") return null;
  const t = raw.trim();
  if (!t) return null;

  const exact = modelFilenames.find((m) => m === t);
  if (exact) return exact;

  const tl = t.toLowerCase();
  const ci = modelFilenames.find((m) => m.toLowerCase() === tl);
  if (ci) return ci;

  const base = t.replace(/^.*[/\\]/, "");
  const byBase = modelFilenames.find(
    (m) => m === base || m.endsWith(base) || base.endsWith(m),
  );
  return byBase ?? null;
}

export type GradcamPayload = {
  type?: string;
  modelKey: string | null;
  imageSrc: string | null;
  errorText: string | null;
  isFinished: boolean;
};

/** Normalize one Grad CAM WebSocket frame. */
export function extractGradcamPayload(
  msg: unknown,
  modelFilenames: readonly string[],
): GradcamPayload {
  const root = asRecord(msg);
  const t = typeof root?.type === "string" ? root.type : undefined;

  if (t === "finished" || root?.status === "finished") {
    return {
      type: t,
      modelKey: null,
      imageSrc: null,
      errorText: null,
      isFinished: true,
    };
  }

  const data = asRecord(root?.data) ?? root;

  const mfRaw =
    (typeof data?.modelFilename === "string" && data.modelFilename) ||
    (typeof data?.model_filename === "string" && data.model_filename) ||
    (typeof root?.modelFilename === "string" && root.modelFilename) ||
    null;

  const modelKey = resolveModelFilenameKey(mfRaw, modelFilenames);

  let imageSrc: string | null = null;
  const rawImg =
    (typeof data?.gradcamImage === "string" && data.gradcamImage) ||
    (typeof data?.gradcam_image === "string" && data.gradcam_image) ||
    (typeof data?.image_base64 === "string" && data.image_base64) ||
    (typeof data?.image === "string" && data.image) ||
    null;

  if (typeof rawImg === "string" && rawImg.length > 0) {
    imageSrc = rawImg.startsWith("data:") ? rawImg : `data:image/png;base64,${rawImg}`;
  }

  const errorText =
    (typeof data?.error === "string" && data.error) ||
    (typeof data?.details === "string" && data.details) ||
    (typeof root?.error === "string" && root.error) ||
    null;

  return {
    type: t,
    modelKey,
    imageSrc,
    errorText,
    isFinished: false,
  };
}

export type LimePayload = {
  type?: string;
  modelKey: string | null;
  imageSrc: string | null;
  errorText: string | null;
  isFinished: boolean;
  progressPct: number | null;
};

/** Normalize one LIME WebSocket frame. */
export function extractLimePayload(
  msg: unknown,
  modelFilenames: readonly string[],
): LimePayload {
  const root = asRecord(msg);
  const t = typeof root?.type === "string" ? root.type : undefined;

  if (t === "finished" || root?.status === "finished") {
    return {
      type: t,
      modelKey: null,
      imageSrc: null,
      errorText: null,
      isFinished: true,
      progressPct: null,
    };
  }

  const data = asRecord(root?.data) ?? root;

  const mfRaw =
    (typeof data?.modelFilename === "string" && data.modelFilename) ||
    (typeof data?.model_filename === "string" && data.model_filename) ||
    (typeof root?.modelFilename === "string" && root.modelFilename) ||
    null;

  const modelKey = resolveModelFilenameKey(mfRaw, modelFilenames);

  let imageSrc: string | null = null;
  const rawImg =
    (typeof data?.limeImage === "string" && data.limeImage) ||
    (typeof data?.lime_image === "string" && data.lime_image) ||
    (typeof data?.image_base64 === "string" && data.image_base64) ||
    (typeof data?.image === "string" && data.image) ||
    null;

  if (typeof rawImg === "string" && rawImg.length > 0) {
    imageSrc = rawImg.startsWith("data:")
      ? rawImg
      : `data:image/png;base64,${rawImg}`;
  }

  const errorText =
    (typeof data?.error === "string" && data.error) ||
    (typeof data?.details === "string" && data.details) ||
    (typeof root?.error === "string" && root.error) ||
    null;

  let progressPct: number | null = null;
  const rawProgress =
    (typeof data?.progress === "number" && data.progress) ||
    (typeof root?.progress === "number" && root.progress) ||
    null;
  if (typeof rawProgress === "number" && Number.isFinite(rawProgress)) {
    progressPct =
      rawProgress <= 1 ? Math.round(rawProgress * 100) : Math.round(rawProgress);
  }

  return {
    type: t,
    modelKey,
    imageSrc,
    errorText,
    isFinished: false,
    progressPct,
  };
}
