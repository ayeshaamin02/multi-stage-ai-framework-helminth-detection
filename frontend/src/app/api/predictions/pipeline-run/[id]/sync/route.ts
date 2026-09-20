import { NextResponse } from "next/server";
import { resolvePredictionUserId } from "@/lib/prediction-api-auth";
import { serviceSyncPipelineRun } from "@/lib/server/pipeline-run-service";

export const runtime = "nodejs";

type RouteParams = { params: Promise<{ id: string }> };

function syncErrorStatus(error: string): number {
  if (error === "Not found.") return 404;
  if (error.includes("Database is not configured")) return 503;
  if (
    error.includes("Helminth status HTTP") ||
    error.includes("Could not reach helminth API") ||
    error.includes("remote API")
  ) {
    return 502;
  }
  return 500;
}

export async function GET(request: Request, context: RouteParams) {
  try {
    const { userId } = await resolvePredictionUserId(request);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    const result = await serviceSyncPipelineRun(userId, id);
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: syncErrorStatus(result.error) },
      );
    }

    return NextResponse.json(result);
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
