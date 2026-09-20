import { NextResponse } from "next/server";
import { resolvePredictionUserId } from "@/lib/prediction-api-auth";
import { isValidImageHashHex } from "@/lib/image-hash";
import {
  serviceSubmitPipelineRun,
  type PipelineCachedOk,
} from "@/lib/server/pipeline-run-service";

export const runtime = "nodejs";

function submitErrorStatus(error: string, code?: string): number {
  if (code === "429") return 429;
  if (
    error === "Empty file." ||
    error.startsWith("File too large") ||
    error.startsWith("Unsupported image type") ||
    error === "Missing image file (form field: image)."
  ) {
    return 400;
  }
  if (error.includes("Database is not configured")) return 503;
  if (
    error.includes("Could not reach helminth API") ||
    error.includes("Batch HTTP")
  ) {
    return 502;
  }
  return 500;
}

function isCachedResult(
  result: Awaited<ReturnType<typeof serviceSubmitPipelineRun>>,
): result is PipelineCachedOk {
  return result.ok === true && "cached" in result && result.cached === true;
}

export async function POST(request: Request) {
  try {
    const { userId } = await resolvePredictionUserId(request);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const image = formData.get("image");
    if (!image || !(image instanceof File)) {
      return NextResponse.json(
        { error: "Missing image file (form field: image)." },
        { status: 400 },
      );
    }

    const rawHash = formData.get("imageHash");
    const imageHash =
      typeof rawHash === "string" && isValidImageHashHex(rawHash)
        ? rawHash
        : undefined;
    const forceRerun = formData.get("forceRerun") === "true";
    const skipStage1 = formData.get("skipStage1") === "true";
    const skipStage2 = formData.get("skipStage2") === "true";
    const rawStage3Model = formData.get("stage3ModelFilename");
    const stage3ModelFilename =
      typeof rawStage3Model === "string" && rawStage3Model.trim()
        ? rawStage3Model.trim()
        : undefined;
    const idempotencyKey = request.headers.get("Idempotency-Key")?.trim() || undefined;

    const result = await serviceSubmitPipelineRun(userId, image, {
      imageHash,
      forceRerun,
      idempotencyKey,
      skipStage1,
      skipStage2,
      stage3ModelFilename,
    });
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: submitErrorStatus(result.error, result.code) },
      );
    }

    if (isCachedResult(result)) {
      return NextResponse.json(result);
    }

    return NextResponse.json({
      id: result.id,
      stage: result.stage,
      idempotent: result.idempotent,
    });
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : "Server error";
    if (message.includes("DATABASE_URL")) {
      return NextResponse.json(
        { error: "Database is not configured (DATABASE_URL)." },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
