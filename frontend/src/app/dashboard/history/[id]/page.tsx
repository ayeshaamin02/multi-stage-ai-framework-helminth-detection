import { ExplanationsTabs } from "@/components/dashboard/explanations-tabs";
import { RunDetailActions } from "@/components/dashboard/run-detail-actions";
import { RunDetailImage } from "@/components/dashboard/run-detail-image";
import { buttonVariants } from "@/components/ui/button-variants";
import { getCachedDashboardSession } from "@/lib/auth/dashboard-session";
import { getDetectionPaletteEntryForClass } from "@/lib/detection-palette";
import { getStage3ModelLabel } from "@/lib/helminth-config";
import { getPipelineRunForUser } from "@/lib/pipeline-db";
import { shortModelName, summarizePipelineRun } from "@/lib/pipeline-summary";
import { createPredictionApiDelegateToken } from "@/lib/prediction-api-token";
import { getStorableUserId } from "@/lib/session-user";
import { buildDetectionOverlayItemsFromResults } from "@/lib/stage3-detection-overlay";
import { cn } from "@/lib/utils";
import { ArrowLeft, History } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Run details",
  description: "Pipeline run details: stages, image, detections, and download.",
};

const STAGE_LABELS = ["Stage 1", "Stage 2", "Stage 3"] as const;

function readVote(value: unknown):
  | { majorityClass?: number; positiveVotes?: number; negativeVotes?: number }
  | null {
  if (value && typeof value === "object") {
    return value as {
      majorityClass?: number;
      positiveVotes?: number;
      negativeVotes?: number;
    };
  }
  return null;
}

function stage1Summary(
  vote: ReturnType<typeof readVote>,
  fallback: string,
): string {
  if (!vote) return fallback;
  const label =
    vote.majorityClass === 0
      ? "Fecal"
      : vote.majorityClass === 1
        ? "Non fecal"
        : "…";
  return `${label} · votes ${vote.positiveVotes ?? 0} / ${vote.negativeVotes ?? 0}`;
}

function stage2Summary(
  vote: ReturnType<typeof readVote>,
  fallback: string,
): string {
  if (!vote) return fallback;
  const label =
    vote.majorityClass === 0
      ? "Helminth"
      : vote.majorityClass === 1
        ? "No helminth"
        : "…";
  return `${label} · votes ${vote.positiveVotes ?? 0} / ${vote.negativeVotes ?? 0}`;
}

export default async function DashboardHistoryRunPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: runId } = await params;
  const { data: session } = await getCachedDashboardSession();
  const userId = session?.user ? getStorableUserId(session.user) : null;
  if (!userId) notFound();

  let run: Awaited<ReturnType<typeof getPipelineRunForUser>> = null;
  try {
    run = await getPipelineRunForUser(runId, userId);
  } catch {
    /* Missing migration or DATABASE_URL */
  }
  if (!run) notFound();

  let predictionApiDelegateToken: string | null = null;
  try {
    predictionApiDelegateToken = createPredictionApiDelegateToken(userId);
  } catch {
    predictionApiDelegateToken = null;
  }

  const stage1Vote = readVote(run.stage1_vote_summary);
  const stage2Vote = readVote(run.stage2_vote_summary);
  const overlayItems =
    run.stage3_result_payload &&
    typeof run.stage3_result_payload === "object"
      ? buildDetectionOverlayItemsFromResults(
          (run.stage3_result_payload as { results?: unknown }).results,
        )
      : [];

  const stage3DetectorLabel = run.stage3_model_filename
    ? getStage3ModelLabel(run.stage3_model_filename)
    : null;
  const stage3Status =
    run.stage3_status === "finished"
      ? `${overlayItems.length} detection(s)${
          stage3DetectorLabel ? ` · ${stage3DetectorLabel}` : ""
        }`
      : run.stage3_status;

  const stageSummaries: Array<{ label: string; text: string }> = [
    {
      label: STAGE_LABELS[0],
      text: stage1Summary(stage1Vote, run.stage1_status),
    },
    {
      label: STAGE_LABELS[1],
      text: stage2Summary(stage2Vote, run.stage2_status),
    },
    {
      label: STAGE_LABELS[2],
      text: stage3Status,
    },
  ];

  return (
    <main className="flex-1 bg-muted/10">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
        <Link
          href="/dashboard?tab=history"
          prefetch={false}
          className={cn(
            buttonVariants({ variant: "ghost", size: "sm" }),
            "-ml-2 inline-flex h-9 items-center gap-1.5 px-2 text-muted-foreground hover:text-foreground",
          )}
        >
          <ArrowLeft className="size-4 shrink-0" aria-hidden />
          Back to history
        </Link>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-muted-foreground [&_svg]:text-primary">
              <History className="size-3.5" aria-hidden />
              Run details
            </p>
            <h1 className="mt-2 truncate text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              {run.original_filename ?? "Untitled run"}
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {new Date(run.created_at).toLocaleString()} · {run.status}
              {run.final_outcome ? ` · ${run.final_outcome}` : ""}
            </p>
            <p
              className="mt-1.5 truncate font-mono text-[11px] text-muted-foreground"
              title={run.id}
            >
              Run ID: {run.id}
            </p>
          </div>
          <RunDetailActions
            runId={run.id}
            originalFilename={run.original_filename}
            hasAnnotatedImage={!!run.stage3_annotated_image_object_key}
            predictionApiDelegateToken={predictionApiDelegateToken}
          />
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {stageSummaries.map((s) => (
            <div
              key={s.label}
              className="rounded-lg border border-border/60 bg-card px-3 py-2.5 text-xs shadow-sm"
            >
              <p className="font-semibold text-foreground">{s.label}</p>
              <p className="mt-1 text-muted-foreground">{s.text}</p>
            </div>
          ))}
        </div>

        <ExplanationsTabs
          runId={run.id}
          stage1Status={run.stage1_status}
          stage2Status={run.stage2_status}
          stage3Status={run.stage3_status}
          stage1Gradcam={run.stage1_gradcam_artifacts}
          stage1Lime={run.stage1_lime_artifacts}
          stage2Gradcam={run.stage2_gradcam_artifacts}
          stage2Lime={run.stage2_lime_artifacts}
          stage3Lime={run.stage3_lime_artifacts}
        />

        {run.stage3_annotated_image_object_key ? (
          <section className="mt-8 space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Species localization (saved image)
            </p>
            <RunDetailImage
              src={`/api/predictions/pipeline-run/${run.id}/image/stage3-annotated`}
              alt="Stage 3 annotated slide"
              tiffDecode={false}
            />
          </section>
        ) : run.image_object_key && overlayItems.length > 0 ? (
          <section className="mt-8 space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Species localization (from stored results)
            </p>
            <RunDetailImage
              withOverlay
              src={`/api/predictions/pipeline-run/${run.id}/image`}
              alt="Uploaded slide with detections"
              items={overlayItems}
              tiffDecode
              filenameHint={run.original_filename}
            />
          </section>
        ) : run.image_object_key ? (
          <section className="mt-8 space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Original upload
            </p>
            <RunDetailImage
              src={`/api/predictions/pipeline-run/${run.id}/image`}
              alt="Uploaded slide"
              tiffDecode
              filenameHint={run.original_filename}
            />
          </section>
        ) : null}

        {overlayItems.length > 0 ? (
          <section className="mt-8 space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Detection legend
            </p>
            <ul className="space-y-1.5 text-sm">
              {overlayItems.map((d) => {
                const col = getDetectionPaletteEntryForClass(d.classId, d.className);
                return (
                  <li
                    key={d.id}
                    className="flex flex-wrap items-center gap-2 rounded-md border border-border/50 bg-card px-2 py-1.5"
                  >
                    <span
                      className="flex size-7 shrink-0 items-center justify-center rounded border-2 font-mono text-xs font-bold text-white"
                      style={{ borderColor: col.border, backgroundColor: col.badge }}
                    >
                      {d.legendKey}
                    </span>
                    <span className="min-w-0 flex-1 font-medium text-foreground">
                      {d.className}
                    </span>
                    <span className="text-muted-foreground">
                      {(d.confidence <= 1
                        ? (d.confidence * 100).toFixed(1)
                        : d.confidence.toFixed(1))}
                      % · {shortModelName(d.modelFilename)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        <p className="mt-8 text-sm leading-relaxed text-muted-foreground">
          {summarizePipelineRun(run)}
        </p>
      </div>
    </main>
  );
}
