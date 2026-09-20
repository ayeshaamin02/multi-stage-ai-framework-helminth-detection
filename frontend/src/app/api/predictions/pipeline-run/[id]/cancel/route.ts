import { NextResponse } from "next/server";
import { resolvePredictionUserId } from "@/lib/prediction-api-auth";
import { serviceCancelPipelineRun } from "@/lib/server/pipeline-run-service";

export const runtime = "nodejs";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteParams) {
  try {
    const { userId } = await resolvePredictionUserId(request);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    const result = await serviceCancelPipelineRun(userId, id);
    if (!result.ok) {
      const status =
        result.error === "Not found."
          ? 404
          : result.error.includes("no longer in progress")
            ? 409
            : 500;
      return NextResponse.json({ error: result.error }, { status });
    }

    return NextResponse.json(result);
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
