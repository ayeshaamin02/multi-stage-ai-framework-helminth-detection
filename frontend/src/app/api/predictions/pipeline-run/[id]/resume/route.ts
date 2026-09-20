import { NextResponse } from "next/server";
import { resolvePredictionUserId } from "@/lib/prediction-api-auth";
import { serviceResumePipelineRun } from "@/lib/server/pipeline-run-service";

export const runtime = "nodejs";

type RouteParams = { params: Promise<{ id: string }> };

function resumeErrorStatus(error: string): number {
  if (error === "Not found.") return 404;
  if (error.includes("no longer in progress")) return 409;
  if (
    error.includes("Helminth status HTTP") ||
    error.includes("Could not reach helminth API") ||
    error.includes("Batch HTTP")
  ) {
    return 502;
  }
  if (error.includes("cannot be resumed")) return 409;
  return 500;
}

export async function POST(request: Request, context: RouteParams) {
  try {
    const { userId } = await resolvePredictionUserId(request);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    const result = await serviceResumePipelineRun(userId, id);
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: resumeErrorStatus(result.error) },
      );
    }

    return NextResponse.json(result);
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
