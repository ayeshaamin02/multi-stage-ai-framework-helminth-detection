import { STAGE1_MODEL_FILENAMES } from "@/lib/helminth-config";
import {
  extractLimePayload as extractLimePayloadGeneric,
  type LimePayload,
} from "@/lib/explanation-ws";

/** Normalize one LIME frame from the Stage 1 API. */
export function extractLimePayload(msg: unknown): LimePayload {
  return extractLimePayloadGeneric(msg, STAGE1_MODEL_FILENAMES);
}
