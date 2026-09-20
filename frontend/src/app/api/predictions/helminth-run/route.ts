import { NextResponse } from "next/server";
import { resolvePredictionUserId } from "@/lib/prediction-api-auth";
import { serviceSubmitStage2OnlyRun } from "@/lib/server/pipeline-run-service";

export const runtime = "nodejs";

function submitErrorStatus(error: string, code?: string): number {
  if (code === "429") return 429;
  if (
    error === "Empty file." ||
    error.startsWith("File too large") ||
    error.startsWith("Unsupported image type") ||
    error === "Missing image file (form field: image)."
  ) {
    return 400;
  }
  if (error.includes("Database is not configured")) return 503;
  if (
    error.includes("Could not reach helminth API") ||
    error.includes("Batch HTTP")
  ) {
    return 502;
  }
  return 500;
}

export async function POST(request: Request) {
  try {
    const { userId } = await resolvePredictionUserId(request);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const image = formData.get("image");
    if (!image || !(image instanceof File)) {
      return NextResponse.json(
        { error: "Missing image file (form field: image)." },
        { status: 400 },
      );
    }

    const result = await serviceSubmitStage2OnlyRun(userId, image);
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: submitErrorStatus(result.error, result.code) },
      );
    }

    return NextResponse.json({
      id: result.id,
      externalJobId: result.stage.externalJobId,
      totalModels: result.stage.totalModels,
    });
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
