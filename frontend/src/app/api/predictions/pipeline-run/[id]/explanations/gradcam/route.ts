import { NextResponse } from "next/server";
import { resolvePredictionUserId } from "@/lib/prediction-api-auth";
import {
  appendStageExplanationArtifact,
  getPipelineRunForUser,
} from "@/lib/pipeline-db";
import {
  STAGE1_MODEL_FILENAMES,
  STAGE2_MODEL_FILENAMES,
} from "@/lib/helminth-config";
import {
  buildExplanationObjectKey,
  uploadExplanationArtifact,
} from "@/lib/server/prediction-image-storage";

export const runtime = "nodejs";

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB per GradCAM PNG.

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
    const stage = rawStage === "1" ? 1 : rawStage === "2" ? 2 : null;
    if (stage === null) {
      return NextResponse.json(
        { error: "Invalid stage (must be '1' or '2')." },
        { status: 400 },
      );
    }

    const modelFilename = String(form.get("modelFilename") ?? "");
    const allowed = stage === 1 ? STAGE1_MODEL_FILENAMES : STAGE2_MODEL_FILENAMES;
    if (!modelFilename || !(allowed as readonly string[]).includes(modelFilename)) {
      return NextResponse.json(
        { error: "Unknown modelFilename for this stage." },
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
    const objectKey = buildExplanationObjectKey({
      userId,
      runId: run.id,
      stage,
      kind: "gradcam",
      modelFilename,
    });
    await uploadExplanationArtifact({
      objectKey,
      body: buffer,
      contentType: file.type || "image/png",
    });
    const createdAt = new Date().toISOString();
    await appendStageExplanationArtifact({
      runId: run.id,
      userId,
      stage,
      kind: "gradcam",
      entry: { modelFilename, objectKey, createdAt },
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
