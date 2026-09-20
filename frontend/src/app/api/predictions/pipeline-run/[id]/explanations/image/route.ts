import { NextResponse } from "next/server";
import { resolvePredictionUserId } from "@/lib/prediction-api-auth";
import {
  getPipelineRunForUser,
  type GradcamArtifactEntry,
  type LimeArtifactEntry,
} from "@/lib/pipeline-db";
import { getPredictionImage } from "@/lib/server/prediction-image-storage";

export const runtime = "nodejs";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteParams) {
  try {
    const { userId } = await resolvePredictionUserId(request);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: runId } = await context.params;
    const url = new URL(request.url);
    const stageParam = url.searchParams.get("stage");
    const stage =
      stageParam === "1"
        ? 1
        : stageParam === "2"
          ? 2
          : stageParam === "3"
            ? 3
            : null;
    const kind = url.searchParams.get("kind");
    const modelFilename = url.searchParams.get("modelFilename");
    const objectKeyOverride = url.searchParams.get("objectKey");
    if (stage === null || (kind !== "gradcam" && kind !== "lime") || !modelFilename) {
      return NextResponse.json(
        { error: "Missing or invalid query (stage, kind, modelFilename)." },
        { status: 400 },
      );
    }

    const run = await getPipelineRunForUser(runId, userId);
    if (!run) {
      return NextResponse.json({ error: "Run not found." }, { status: 404 });
    }

    const list: Array<GradcamArtifactEntry | LimeArtifactEntry> =
      stage === 1 && kind === "gradcam"
        ? run.stage1_gradcam_artifacts
        : stage === 1 && kind === "lime"
          ? run.stage1_lime_artifacts
          : stage === 2 && kind === "gradcam"
            ? run.stage2_gradcam_artifacts
            : stage === 2 && kind === "lime"
              ? run.stage2_lime_artifacts
              : stage === 3 && kind === "lime"
                ? run.stage3_lime_artifacts
                : [];

    // If an `objectKey` is supplied, prefer that exact entry (LIME has multiple
    // entries per model — UI must specify which). Otherwise pick the most
    // recent matching modelFilename.
    const match = objectKeyOverride
      ? list.find((e) => e.objectKey === objectKeyOverride)
      : [...list]
          .filter((e) => e.modelFilename === modelFilename)
          .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0];
    if (!match) {
      return NextResponse.json({ error: "Artifact not found." }, { status: 404 });
    }

    const userSegment = userId.replace(/[^a-zA-Z0-9._-]/g, "_");
    const expectedPrefix = `users/${userSegment}/runs/${run.id}/explanations/stage${stage}/${kind}/`;
    if (!match.objectKey.startsWith(expectedPrefix)) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }

    const object = await getPredictionImage(match.objectKey);
    if (!object) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }

    const headers = new Headers();
    headers.set("Content-Type", object.contentType || "image/png");
    headers.set("Cache-Control", "public, max-age=31536000, immutable");
    headers.set("X-Content-Type-Options", "nosniff");
    if (object.etag) headers.set("ETag", object.etag);
    if (typeof object.contentLength === "number") {
      headers.set("Content-Length", String(object.contentLength));
    }
    return new Response(object.body, { status: 200, headers });
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
