import { NextResponse } from "next/server";
import { resolvePredictionUserId } from "@/lib/prediction-api-auth";
import { serviceListPipelineHistory } from "@/lib/server/pipeline-run-service";

export const runtime = "nodejs";

const LIMIT = 50;
const MAX_LIMIT = 100;

export async function GET(request: Request) {
  try {
    const { userId } = await resolvePredictionUserId(request);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const limitParam = Number(url.searchParams.get("limit"));
    const offsetParam = Number(url.searchParams.get("offset"));
    const limit =
      Number.isFinite(limitParam) && limitParam > 0
        ? Math.min(MAX_LIMIT, Math.floor(limitParam))
        : LIMIT;
    const offset =
      Number.isFinite(offsetParam) && offsetParam >= 0
        ? Math.floor(offsetParam)
        : 0;

    const result = await serviceListPipelineHistory(userId, limit, offset);
    if (!result.ok) {
      const status = result.error.includes("Database is not configured")
        ? 503
        : 500;
      return NextResponse.json({ error: result.error }, { status });
    }

    return NextResponse.json({ items: result.items });
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
