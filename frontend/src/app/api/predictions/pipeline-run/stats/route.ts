import { NextResponse } from "next/server";
import { resolvePredictionUserId } from "@/lib/prediction-api-auth";
import { serviceGetPipelineStats } from "@/lib/server/pipeline-run-service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { userId } = await resolvePredictionUserId(request);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await serviceGetPipelineStats(userId);
    if (!result.ok) {
      const status = result.error.includes("Database is not configured")
        ? 503
        : 500;
      return NextResponse.json({ error: result.error }, { status });
    }

    return NextResponse.json({ stats: result.stats });
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
