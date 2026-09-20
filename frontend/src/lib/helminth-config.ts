/**
 * Server-only: HTTP bases for forwarding batch + status to remote APIs.
 * Model lists are fixed here so clients cannot request arbitrary paths.
 */
export const STAGE1_MODEL_FILENAMES = [
  "BINARY_ConvNeXtBase_Round1.keras",
  "BINARY_DenseNet169_Round4.keras",
  "BINARY_EfficientNetB0_Round4.keras",
  "BINARY_MobileNetV2_Round4.keras",
  "BINARY_NASNetMobile_Round1.keras",
  "BINARY_ResNet50_Round2.keras",
  "BINARY_VGG19_Round2.keras",
] as const;

export const STAGE2_MODEL_FILENAMES = [
  "HELMINTHS_BINARY_ConvNeXtBase_Round1.keras",
  "HELMINTHS_BINARY_DenseNet169_Round2.keras",
  "HELMINTHS_BINARY_EfficientNetB0_Round3.keras",
  "HELMINTHS_BINARY_MobileNetV2_Round5.keras",
  "HELMINTHS_BINARY_NASNetMobile_Round3.keras",
  "HELMINTHS_BINARY_ResNet50_Round2.keras",
  "HELMINTHS_BINARY_VGG19_Round4.keras",
] as const;

/** Stage 3 multiclass detection (Ultralytics .pt on dedicated API). */
export const STAGE3_MODEL_FILENAMES = [
  "multiclass_helminths_yolo11_l_round_2_best.pt",
  "multiclass_helminths_rtdetr_l_round_5_best.pt",
] as const;

export type Stage3ModelOption = {
  id: string;
  label: string;
  filename: (typeof STAGE3_MODEL_FILENAMES)[number];
};

/** User-facing labels for the Stage 3 detector picker. */
export const STAGE3_MODEL_OPTIONS: readonly Stage3ModelOption[] = [
  {
    id: "yolo",
    label: "YOLOv11-L (Round 2)",
    filename: "multiclass_helminths_yolo11_l_round_2_best.pt",
  },
  {
    id: "rtdetr",
    label: "RT-DETR-L (Round 5)",
    filename: "multiclass_helminths_rtdetr_l_round_5_best.pt",
  },
] as const;

export const DEFAULT_STAGE3_MODEL_FILENAME =
  "multiclass_helminths_yolo11_l_round_2_best.pt" as const;

export function getStage3ModelLabel(filename: string | null | undefined): string {
  if (!filename) return "Unknown";
  const opt = STAGE3_MODEL_OPTIONS.find((o) => o.filename === filename);
  if (opt) return opt.label;
  if (filename.toLowerCase().includes("yolo")) return "YOLO";
  if (filename.toLowerCase().includes("rtdetr")) return "RT-DETR";
  return filename.replace(/\.pt$/i, "");
}

export const HELMINTH_MODEL_INPUT_SIZE = 224;
export const STAGE1_MODEL_INPUT_SIZE = 224;
export const STAGE2_MODEL_INPUT_SIZE = 224;
export const STAGE3_MODEL_INPUT_SIZE = 224;

/** Backward compatibility for older Stage-2-only flows. */
export const HELMINTH_MODEL_FILENAMES = STAGE2_MODEL_FILENAMES;

/** Stage 1 fecal gate (defaults to legacy `HELMINTH_API_BASE_URL`). */
export function getStage1ApiBaseUrl(): string {
  const base =
    process.env.STAGE1_API_BASE_URL?.replace(/\/$/, "") ??
    process.env.HELMINTH_API_BASE_URL?.replace(/\/$/, "") ??
    "https://binaryapi.helminthdetect.app";
  return base;
}

/** Stage 2 helminth binary screening. */
export function getStage2ApiBaseUrl(): string {
  const base =
    process.env.STAGE2_API_BASE_URL?.replace(/\/$/, "") ??
    "https://stage2api.helminthdetect.app";
  return base;
}

/** Stage 3 species detection (.pt models). */
export function getStage3ApiBaseUrl(): string {
  const base =
    process.env.STAGE3_API_BASE_URL?.replace(/\/$/, "") ??
    "https://stage3api.helminthdetect.app";
  return base;
}

/** @deprecated Prefer getStage1ApiBaseUrl — same intent as legacy env name. */
export function getHelminthApiBaseUrl(): string {
  return getStage1ApiBaseUrl();
}

function trimTrailingSlash(s: string): string {
  return s.replace(/\/$/, "");
}

/** Browser: WebSocket origin for Stage 1 remote job. */
export function getStage1WsOriginForClient(): string {
  return trimTrailingSlash(
    process.env.NEXT_PUBLIC_STAGE1_WS_ORIGIN ?? "wss://binaryapi.helminthdetect.app",
  );
}

/** Browser: Grad CAM stream for Stage 1 batch job (after prediction WS closes). */
export function getStage1GradcamWsUrl(jobId: string): string {
  const origin = getStage1WsOriginForClient();
  return `${origin}/ws/gradcam/${encodeURIComponent(jobId)}`;
}

/** Browser: LIME explanation stream for Stage 1 batch job. Client must send
 *  `{modelFilename, numSamples}` once the WS opens. */
export function getStage1LimeWsUrl(jobId: string): string {
  const origin = getStage1WsOriginForClient();
  return `${origin}/ws/lime/${encodeURIComponent(jobId)}`;
}

/** Browser: WebSocket origin for Stage 2 remote job. */
export function getStage2WsOriginForClient(): string {
  return trimTrailingSlash(
    process.env.NEXT_PUBLIC_STAGE2_WS_ORIGIN ?? "wss://stage2api.helminthdetect.app",
  );
}

/** Browser: Grad CAM stream for Stage 2 batch job. */
export function getStage2GradcamWsUrl(jobId: string): string {
  const origin = getStage2WsOriginForClient();
  return `${origin}/ws/gradcam/${encodeURIComponent(jobId)}`;
}

/** Browser: LIME explanation stream for Stage 2 batch job. Client must send
 *  `{modelFilename, numSamples}` once the WS opens. */
export function getStage2LimeWsUrl(jobId: string): string {
  const origin = getStage2WsOriginForClient();
  return `${origin}/ws/lime/${encodeURIComponent(jobId)}`;
}

/** Browser: WebSocket origin for Stage 3 remote job. */
export function getStage3WsOriginForClient(): string {
  return trimTrailingSlash(
    process.env.NEXT_PUBLIC_STAGE3_WS_ORIGIN ?? "wss://stage3api.helminthdetect.app",
  );
}

/** When false, Stage 3 LIME controls and history tabs are hidden (Stages 1–2 unchanged). */
export const STAGE3_LIME_UI_ENABLED = false;

/** Browser: LIME explanation stream for Stage 3 batch job. */
export function getStage3LimeWsUrl(jobId: string): string {
  const origin = getStage3WsOriginForClient();
  return `${origin}/ws/lime/${encodeURIComponent(jobId)}`;
}
