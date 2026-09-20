import { createHash } from "node:crypto";
import {
  STAGE1_MODEL_FILENAMES,
  STAGE2_MODEL_FILENAMES,
  STAGE3_MODEL_FILENAMES,
} from "@/lib/helminth-config";

/** Deterministic cache partition key from the active model manifest (+ optional PIPELINE_REV). */
export function getPipelineVersionKey(): string {
  const rev = process.env.PIPELINE_REV?.trim() ?? "";
  const raw = [
    STAGE1_MODEL_FILENAMES.join("|"),
    STAGE2_MODEL_FILENAMES.join("|"),
    STAGE3_MODEL_FILENAMES.join("|"),
    rev,
  ].join("||");
  return createHash("sha256").update(raw).digest("hex");
}
