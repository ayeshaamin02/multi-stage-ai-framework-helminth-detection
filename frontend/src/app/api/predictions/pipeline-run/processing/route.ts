import { NextResponse } from "next/server";
import { resolvePredictionUserId } from "@/lib/prediction-api-auth";
import { serviceListUnfinishedRuns } from "@/lib/server/pipeline-run-service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { userId } = await resolvePredictionUserId(request);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await serviceListUnfinishedRuns(userId);
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: result.error.includes("DATABASE_URL") ? 503 : 500 },
      );
    }

    return NextResponse.json(result);
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
