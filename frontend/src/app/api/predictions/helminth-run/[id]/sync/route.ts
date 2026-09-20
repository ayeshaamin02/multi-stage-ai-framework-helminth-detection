import { NextResponse } from "next/server";
import { resolvePredictionUserId } from "@/lib/prediction-api-auth";
import { serviceSyncPipelineRun } from "@/lib/server/pipeline-run-service";

export const runtime = "nodejs";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * Fallback when WebSocket is unavailable: returns remote job JSON and,
 * if finished, persists the same snapshot as finalize.
 */
export async function GET(request: Request, context: RouteParams) {
  try {
    const { userId } = await resolvePredictionUserId(request);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    const result = await serviceSyncPipelineRun(userId, id);
    if (!result.ok) {
      const status =
        result.error === "Not found."
          ? 404
          : result.error.includes("Database is not configured")
            ? 503
            : result.error.includes("Helminth status HTTP") ||
                result.error.includes("Could not reach helminth API") ||
                result.error.includes("remote API")
              ? 502
              : 500;
      return NextResponse.json({ error: result.error }, { status });
    }

    if (result.stage === 1) {
      return NextResponse.json(
        {
          error:
            result.gateDecision === "non_fecal"
              ? "Stage 2 was skipped because Stage 1 is non fecal."
              : "Stage 2 has not started yet.",
          runStatus: result.runStatus,
          gateDecision: result.gateDecision,
        },
        { status: 409 },
      );
    }

    return NextResponse.json({
      persisted: result.persisted,
      remote: result.remote ?? null,
      runStatus: result.runStatus,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Server error";
    if (message.includes("DATABASE_URL")) {
      return NextResponse.json(
        { error: "Database is not configured (DATABASE_URL)." },
        { status: 503 },
      );
    }
    console.error("[helminth sync]", e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
