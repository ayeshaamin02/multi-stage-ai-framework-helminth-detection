import { STAGE1_MODEL_FILENAMES } from "@/lib/helminth-config";
import {
  extractGradcamPayload as extractGradcamPayloadGeneric,
  resolveModelFilenameKey,
  type GradcamPayload,
} from "@/lib/explanation-ws";

/** Map an API model filename to the canonical Stage 1 manifest key. */
export function resolveStage1ModelFilenameKey(
  raw: string | undefined | null,
): string | null {
  return resolveModelFilenameKey(raw, STAGE1_MODEL_FILENAMES);
}

/** Normalize one Grad CAM frame from the Stage 1 API. */
export function extractGradcamPayload(msg: unknown): GradcamPayload {
  return extractGradcamPayloadGeneric(msg, STAGE1_MODEL_FILENAMES);
}
