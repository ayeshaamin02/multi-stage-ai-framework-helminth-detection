import { NextResponse } from "next/server";
import { resolvePredictionUserId } from "@/lib/prediction-api-auth";
import {
  appendStageExplanationArtifact,
  getPipelineRunForUser,
} from "@/lib/pipeline-db";
import {
  STAGE1_MODEL_FILENAMES,
  STAGE2_MODEL_FILENAMES,
  STAGE3_MODEL_FILENAMES,
} from "@/lib/helminth-config";
import {
  buildExplanationObjectKey,
  uploadExplanationArtifact,
} from "@/lib/server/prediction-image-storage";

export const runtime = "nodejs";

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB per LIME PNG (segmented overlays are larger).

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteParams) {
  try {
    const { userId } = await resolvePredictionUserId(request);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id: runId } = await context.params;
    const run = await getPipelineRunForUser(runId, userId);
    if (!run) {
      return NextResponse.json({ error: "Run not found." }, { status: 404 });
    }

    const form = await request.formData();
    const rawStage = String(form.get("stage") ?? "");
    const stage =
      rawStage === "1" ? 1 : rawStage === "2" ? 2 : rawStage === "3" ? 3 : null;
    if (stage === null) {
      return NextResponse.json(
        { error: "Invalid stage (must be '1', '2', or '3')." },
        { status: 400 },
      );
    }

    const modelFilename = String(form.get("modelFilename") ?? "");
    const allowed =
      stage === 1
        ? STAGE1_MODEL_FILENAMES
        : stage === 2
          ? STAGE2_MODEL_FILENAMES
          : STAGE3_MODEL_FILENAMES;
    if (!modelFilename || !(allowed as readonly string[]).includes(modelFilename)) {
      return NextResponse.json(
        { error: "Unknown modelFilename for this stage." },
        { status: 400 },
      );
    }

    const rawSamples = Number(form.get("numSamples") ?? "");
    const numSamples =
      Number.isFinite(rawSamples) && rawSamples > 0
        ? Math.max(10, Math.min(1000, Math.round(rawSamples)))
        : null;
    if (numSamples === null) {
      return NextResponse.json(
        { error: "Invalid numSamples (10-1000)." },
        { status: 400 },
      );
    }

    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "Missing 'file' upload." },
        { status: 400 },
      );
    }
    if (file.size === 0 || file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: `File size out of range (0, ${MAX_BYTES}].` },
        { status: 413 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const createdAtMs = Date.now();
    const objectKey = buildExplanationObjectKey({
      userId,
      runId: run.id,
      stage,
      kind: "lime",
      modelFilename,
      numSamples,
      createdAtMs,
    });
    await uploadExplanationArtifact({
      objectKey,
      body: buffer,
      contentType: file.type || "image/png",
    });
    const createdAt = new Date(createdAtMs).toISOString();
    await appendStageExplanationArtifact({
      runId: run.id,
      userId,
      stage,
      kind: "lime",
      entry: { modelFilename, objectKey, numSamples, createdAt },
    });

    return NextResponse.json({ ok: true, objectKey, createdAt });
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : "Server error";
    if (message.includes("DATABASE_URL")) {
      return NextResponse.json(
        { error: "Database is not configured (DATABASE_URL)." },
        { status: 503 },
      );
    }
    if (message.includes("R2 is not configured")) {
      return NextResponse.json({ error: message }, { status: 503 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
