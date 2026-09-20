import { NextResponse } from "next/server";
import { resolvePredictionUserId } from "@/lib/prediction-api-auth";
import { getPipelineRunForUser } from "@/lib/pipeline-db";
import { getPredictionImage } from "@/lib/server/prediction-image-storage";

export const runtime = "nodejs";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteParams) {
  try {
    const { userId } = await resolvePredictionUserId(request);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    const run = await getPipelineRunForUser(id, userId);
    if (!run || !run.image_object_key) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    const expectedPrefix = `users/${userId.replace(/[^a-zA-Z0-9._-]/g, "_")}/runs/${run.id}/`;
    if (!run.image_object_key.startsWith(expectedPrefix)) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }

    const object = await getPredictionImage(run.image_object_key);
    if (!object) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }

    const headers = new Headers();
    headers.set("Content-Type", object.contentType);
    headers.set("Cache-Control", "private, no-store");
    headers.set("X-Content-Type-Options", "nosniff");
    if (object.etag) headers.set("ETag", object.etag);
    if (typeof object.contentLength === "number") {
      headers.set("Content-Length", String(object.contentLength));
    }
    if (run.original_filename) {
      headers.set(
        "Content-Disposition",
        `inline; filename="${encodeURIComponent(run.original_filename)}"`,
      );
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
