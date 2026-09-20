"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  STAGE1_MODEL_FILENAMES,
  STAGE2_MODEL_FILENAMES,
  STAGE3_LIME_UI_ENABLED,
} from "@/lib/helminth-config";
import type {
  GradcamArtifactEntry,
  LimeArtifactEntry,
  StageRunStatus,
} from "@/lib/pipeline-db";
import { motion, useReducedMotion } from "framer-motion";
import { Eye, ImageOff, Lightbulb, Maximize2, X } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";

type TabId = "s1-gradcam" | "s1-lime" | "s2-gradcam" | "s2-lime" | "s3-lime";

type TabDef = {
  id: TabId;
  label: string;
  short: string;
  stage: 1 | 2 | 3;
  kind: "gradcam" | "lime";
};

const ALL_TABS: TabDef[] = [
  { id: "s1-gradcam", label: "Stage 1 · GradCAM", short: "S1 GradCAM", stage: 1, kind: "gradcam" },
  { id: "s1-lime", label: "Stage 1 · LIME", short: "S1 LIME", stage: 1, kind: "lime" },
  { id: "s2-gradcam", label: "Stage 2 · GradCAM", short: "S2 GradCAM", stage: 2, kind: "gradcam" },
  { id: "s2-lime", label: "Stage 2 · LIME", short: "S2 LIME", stage: 2, kind: "lime" },
  { id: "s3-lime", label: "Stage 3 · LIME", short: "S3 LIME", stage: 3, kind: "lime" },
];

const TABS = STAGE3_LIME_UI_ENABLED
  ? ALL_TABS
  : ALL_TABS.filter((t) => t.id !== "s3-lime");

export type ExplanationsTabsProps = {
  runId: string;
  stage1Status: StageRunStatus;
  stage2Status: StageRunStatus;
  stage3Status: StageRunStatus;
  stage1Gradcam: GradcamArtifactEntry[];
  stage1Lime: LimeArtifactEntry[];
  stage2Gradcam: GradcamArtifactEntry[];
  stage2Lime: LimeArtifactEntry[];
  stage3Lime: LimeArtifactEntry[];
};

function shortModelName(filename: string): string {
  return filename
    .replace(/\.keras$/i, "")
    .replace(/\.pt$/i, "")
    .replace(/^HELMINTHS_BINARY_/i, "")
    .replace(/^BINARY_/i, "");
}

function formatRelativeTime(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  return new Date(t).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function emptyStateMessage(
  stage: 1 | 2 | 3,
  kind: "gradcam" | "lime",
  stage1Status: StageRunStatus,
  stage2Status: StageRunStatus,
  stage3Status: StageRunStatus,
): string {
  const stageStatus =
    stage === 1 ? stage1Status : stage === 2 ? stage2Status : stage3Status;
  if (stage === 2 && stage1Status === "finished" && stage2Status === "skipped") {
    return "Stage 2 was skipped (Stage 1 returned non-fecal), so no Stage 2 explanations exist.";
  }
  if (stage === 3 && stage1Status === "finished" && stage2Status === "skipped") {
    return "Stage 3 was skipped (Stage 1 returned non-fecal).";
  }
  if (stage === 3 && stage2Status === "finished" && stage3Status === "skipped") {
    return "Stage 3 was skipped (no helminth detected at Stage 2).";
  }
  if (stageStatus === "skipped") {
    return `Stage ${stage} was skipped for this run.`;
  }
  if (stageStatus === "failed") {
    return `Stage ${stage} failed before any ${kind === "gradcam" ? "GradCAM" : "LIME"} was generated.`;
  }
  if (kind === "lime") {
    return `No LIME explanations were run on Stage ${stage} models for this prediction.`;
  }
  return `No Stage ${stage} GradCAM overlays were saved for this run.`;
}

export function ExplanationsTabs({
  runId,
  stage1Status,
  stage2Status,
  stage3Status,
  stage1Gradcam,
  stage1Lime,
  stage2Gradcam,
  stage2Lime,
  stage3Lime,
}: ExplanationsTabsProps) {
  const reduceMotion = useReducedMotion();
  const indicatorId = useId();
  const [active, setActive] = useState<TabId>("s1-gradcam");
  const [lightbox, setLightbox] = useState<{ src: string; title: string } | null>(
    null,
  );

  // Counts drive both the tab counter pill and the empty-state branch.
  const counts: Record<TabId, number> = useMemo(
    () => ({
      "s1-gradcam": stage1Gradcam.length,
      "s1-lime": stage1Lime.length,
      "s2-gradcam": stage2Gradcam.length,
      "s2-lime": stage2Lime.length,
      "s3-lime": STAGE3_LIME_UI_ENABLED ? stage3Lime.length : 0,
    }),
    [
      stage1Gradcam.length,
      stage1Lime.length,
      stage2Gradcam.length,
      stage2Lime.length,
      stage3Lime.length,
    ],
  );

  const totalCount = TABS.reduce((sum, t) => sum + counts[t.id], 0);

  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightbox(null);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [lightbox]);

  // Hide the section entirely if no artifacts were ever saved (cleaner detail
  // page for runs that predate this feature or terminated very early).
  if (totalCount === 0) {
    return null;
  }

  const activeTab =
    TABS.find((t) => t.id === active) ?? TABS[0]!;
  const effectiveActive = activeTab.id;
  const modelList =
    activeTab.stage === 1
      ? STAGE1_MODEL_FILENAMES
      : activeTab.stage === 2
        ? STAGE2_MODEL_FILENAMES
        : [];

  // Group entries by model — useful so all LIME runs for a given model cluster.
  const grouped = (() => {
    const list: ReadonlyArray<GradcamArtifactEntry | LimeArtifactEntry> =
      activeTab.id === "s1-gradcam"
        ? stage1Gradcam
        : activeTab.id === "s1-lime"
          ? stage1Lime
          : activeTab.id === "s2-gradcam"
            ? stage2Gradcam
            : activeTab.id === "s2-lime"
              ? stage2Lime
              : stage3Lime;
    const map = new Map<string, Array<GradcamArtifactEntry | LimeArtifactEntry>>();
    for (const entry of list) {
      const existing = map.get(entry.modelFilename) ?? [];
      existing.push(entry);
      map.set(entry.modelFilename, existing);
    }
    // Order: models in canonical order, unknown ones at the end.
    const orderedModels = [
      ...modelList.filter((m) => map.has(m)),
      ...Array.from(map.keys()).filter(
        (m) => !(modelList as readonly string[]).includes(m),
      ),
    ];
    return orderedModels.map((m) => ({
      modelFilename: m,
      entries: (map.get(m) ?? []).sort((a, b) =>
        a.createdAt < b.createdAt ? 1 : -1,
      ),
    }));
  })();

  const imgUrl = (e: GradcamArtifactEntry | LimeArtifactEntry) =>
    `/api/predictions/pipeline-run/${encodeURIComponent(runId)}/explanations/image?stage=${activeTab.stage}&kind=${activeTab.kind}&modelFilename=${encodeURIComponent(e.modelFilename)}&objectKey=${encodeURIComponent(e.objectKey)}`;

  return (
    <section className="mt-8">
      <div className="flex items-center gap-2">
        <Eye className="size-4 text-muted-foreground" aria-hidden />
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Saved explanations
        </h2>
      </div>

      <div
        role="tablist"
        aria-label="Saved explanations sections"
        className="mt-3 flex w-full flex-wrap items-center gap-1 rounded-xl border border-border/70 bg-card p-1 shadow-sm"
      >
        {TABS.map((t) => {
          const isActive = effectiveActive === t.id;
          const count = counts[t.id];
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls={`explanations-panel-${t.id}`}
              id={`explanations-tab-${t.id}`}
              onClick={() => setActive(t.id)}
              className={cn(
                "relative inline-flex flex-1 min-w-[10rem] items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-colors sm:text-sm",
                isActive
                  ? "text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {isActive ? (
                reduceMotion ? (
                  <span className="absolute inset-0 rounded-lg bg-primary shadow-sm" />
                ) : (
                  <motion.span
                    layoutId={indicatorId}
                    className="absolute inset-0 rounded-lg bg-primary shadow-sm"
                    transition={{ type: "spring", stiffness: 380, damping: 32 }}
                  />
                )
              ) : null}
              <span className="relative z-10 inline-flex items-center gap-1.5">
                <span className="hidden sm:inline">{t.label}</span>
                <span className="sm:hidden">{t.short}</span>
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
                    isActive
                      ? "bg-primary-foreground/15 text-primary-foreground"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {count}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id={`explanations-panel-${effectiveActive}`}
        aria-labelledby={`explanations-tab-${effectiveActive}`}
        className="mt-4"
      >
        {counts[effectiveActive] === 0 ? (
          <Card className="border-dashed border-border/70 bg-muted/10">
            <CardContent className="flex flex-col items-center gap-2 px-4 py-8 text-center">
              <ImageOff className="size-8 text-muted-foreground/60" aria-hidden />
              <p className="max-w-md text-sm text-muted-foreground">
                {emptyStateMessage(
                  activeTab.stage,
                  activeTab.kind,
                  stage1Status,
                  stage2Status,
                  stage3Status,
                )}
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-border/70">
            <CardHeader className="space-y-1">
              <CardTitle className="flex items-center gap-2 text-base">
                {activeTab.kind === "lime" ? (
                  <Lightbulb className="size-4 text-amber-500" aria-hidden />
                ) : (
                  <Eye className="size-4 text-muted-foreground" aria-hidden />
                )}
                {activeTab.label}
              </CardTitle>
              <CardDescription>
                {activeTab.kind === "gradcam"
                  ? `Heatmaps from Stage ${activeTab.stage} models. Tap to enlarge.`
                  : `LIME explanations run on Stage ${activeTab.stage} models. Tap to enlarge.`}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {grouped.map((group) => (
                <div key={group.modelFilename} className="space-y-2">
                  <p className="font-mono text-[11px] font-medium text-foreground">
                    {shortModelName(group.modelFilename)}
                  </p>
                  <div
                    className={cn(
                      "grid gap-3",
                      activeTab.kind === "gradcam"
                        ? "sm:grid-cols-2 lg:grid-cols-3"
                        : "sm:grid-cols-2",
                    )}
                  >
                    {group.entries.map((entry) => {
                      const lime = entry as LimeArtifactEntry;
                      const isLime = activeTab.kind === "lime";
                      return (
                        <button
                          key={entry.objectKey}
                          type="button"
                          className="group relative flex flex-col items-stretch overflow-hidden rounded-lg border border-border/60 bg-muted/10 text-left transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          onClick={() =>
                            setLightbox({
                              src: imgUrl(entry),
                              title: isLime
                                ? `${shortModelName(entry.modelFilename)} · ${lime.numSamples} samples`
                                : shortModelName(entry.modelFilename),
                            })
                          }
                          aria-label={`Open ${activeTab.kind} explanation for ${shortModelName(entry.modelFilename)}`}
                        >
                          <div className="relative aspect-square w-full bg-muted/20">
                            {/* eslint-disable-next-line @next/next/no-img-element -- streamed from R2 via own route */}
                            <img
                              src={imgUrl(entry)}
                              alt={`${activeTab.kind} explanation for ${shortModelName(entry.modelFilename)}`}
                              loading="lazy"
                              decoding="async"
                              className="size-full object-contain"
                            />
                            <span className="pointer-events-none absolute bottom-1 right-1 inline-flex items-center gap-0.5 rounded bg-background/85 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground shadow-sm opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                              <Maximize2 className="size-3" aria-hidden />
                              Enlarge
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-2 border-t border-border/50 bg-muted/20 px-2 py-1.5 text-[10px] text-muted-foreground">
                            <span>{formatRelativeTime(entry.createdAt)}</span>
                            {isLime ? (
                              <span className="rounded-full bg-muted px-1.5 py-0.5 font-medium">
                                {lime.numSamples} samples
                              </span>
                            ) : null}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>

      {lightbox ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-8">
          <button
            type="button"
            className="fixed inset-0 bg-black/55 backdrop-blur-[1px]"
            aria-label="Close details"
            onClick={() => setLightbox(null)}
          />
          <div
            className="relative z-10 mt-0 w-full max-w-3xl rounded-xl border border-border/80 bg-background shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="explanations-lightbox-title"
          >
            <div className="flex flex-col gap-3 border-b border-border/60 px-4 py-3 sm:flex-row sm:items-start sm:justify-between sm:px-5">
              <div className="min-w-0 flex-1">
                <h2
                  id="explanations-lightbox-title"
                  className="truncate text-base font-semibold text-foreground"
                >
                  {lightbox.title}
                </h2>
                <p className="text-xs text-muted-foreground">
                  Explainability only · not a diagnosis
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="shrink-0 self-start"
                onClick={() => setLightbox(null)}
                aria-label="Close"
              >
                <X className="size-4" aria-hidden />
              </Button>
            </div>
            <div className="max-h-[calc(100vh-8rem)] space-y-5 overflow-y-auto px-4 py-4 sm:px-5 sm:py-5">
              <div className="relative w-full min-h-[min(40vh,320px)]">
                {/* eslint-disable-next-line @next/next/no-img-element -- streamed from R2 via own route */}
                <img
                  src={lightbox.src}
                  alt={`Explanation for ${lightbox.title}`}
                  className="relative z-10 mx-auto block h-auto max-h-[min(70vh,560px)] w-full rounded-lg border border-border/60 object-contain"
                />
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
