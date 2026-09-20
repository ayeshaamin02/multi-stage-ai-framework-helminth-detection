import { NextResponse } from "next/server";
import { resolvePredictionUserId } from "@/lib/prediction-api-auth";
import { serviceListPipelineHistory } from "@/lib/server/pipeline-run-service";

export const runtime = "nodejs";

const LIMIT = 50;

export async function GET(request: Request) {
  try {
    const { userId } = await resolvePredictionUserId(request);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await serviceListPipelineHistory(userId, LIMIT);
    if (!result.ok) {
      const status = result.error.includes("Database is not configured")
        ? 503
        : 500;
      return NextResponse.json({ error: result.error }, { status });
    }
    return NextResponse.json({ items: result.items });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Server error";
    if (message.includes("DATABASE_URL")) {
      return NextResponse.json(
        { error: "Database is not configured (DATABASE_URL)." },
        { status: 503 },
      );
    }
    console.error("[predictions history]", e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
