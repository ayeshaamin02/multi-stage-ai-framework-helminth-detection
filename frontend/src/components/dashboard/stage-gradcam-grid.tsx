"use client";

import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AlertCircle, ImageIcon, Maximize2, X } from "lucide-react";

export type GradcamModelEntry = {
  status: "pending" | "ok" | "error";
  imageSrc?: string;
  error?: string;
};

export type StageGradcamPanelPhase = "idle" | "loading" | "complete" | "error";

export type StageGradcamGridProps = {
  /** Title prefix, e.g. "Stage 1" or "Stage 2". */
  stageLabel: string;
  modelFilenames: readonly string[];
  shortName: (filename: string) => string;
  phase: StageGradcamPanelPhase;
  connectionError: string | null;
  byModel: Record<string, GradcamModelEntry>;
};

const HISTORY_DETAIL_IMG_CLASS =
  "relative z-10 mx-auto block h-auto max-h-[min(70vh,560px)] w-full rounded-lg border border-border/60 object-contain";

export function StageGradcamGrid({
  stageLabel,
  modelFilenames,
  shortName,
  phase,
  connectionError,
  byModel,
}: StageGradcamGridProps) {
  const [lightbox, setLightbox] = useState<{
    src: string;
    title: string;
  } | null>(null);

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

  if (phase === "idle") return null;

  const okCount = modelFilenames.filter((m) => byModel[m]?.status === "ok").length;
  const errCount = modelFilenames.filter((m) => byModel[m]?.status === "error").length;
  const pendingCount = modelFilenames.filter((m) => byModel[m]?.status === "pending")
    .length;

  return (
    <>
      <Card className="border-border/80">
        <CardHeader>
          <CardTitle className="text-base">
            {stageLabel} &middot; model attention (Grad CAM)
          </CardTitle>
          <CardDescription>
            Heatmaps show where each model focuses on your image. Not a diagnosis,
            explainability only. Tap a heatmap to enlarge it.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {connectionError ? (
            <div
              className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              role="alert"
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>{connectionError}</span>
            </div>
          ) : null}

          <p className="sr-only" aria-live="polite">
            {phase === "loading"
              ? `Grad CAM progress: ${okCount + errCount} of ${modelFilenames.length} models.`
              : `Grad CAM complete: ${okCount} heatmaps ready, ${errCount} unavailable.`}
          </p>

          <p className="text-xs text-muted-foreground">
            {phase === "loading"
              ? `Generating heatmaps… ${okCount + errCount} / ${modelFilenames.length} models`
              : `${okCount} heatmap${okCount === 1 ? "" : "s"} ready · ${errCount} unavailable · ${pendingCount} pending`}
          </p>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {modelFilenames.map((filename) => {
              const entry = byModel[filename] ?? { status: "pending" as const };
              const canExpand = entry.status === "ok" && Boolean(entry.imageSrc);
              return (
                <div
                  key={filename}
                  className={cn(
                    "flex flex-col overflow-hidden rounded-lg border border-border/60 bg-muted/10",
                    canExpand && "transition-colors hover:border-primary/40",
                  )}
                >
                  <div className="border-b border-border/50 bg-muted/30 px-2 py-1.5">
                    <p className="truncate font-mono text-[11px] font-medium text-foreground">
                      {shortName(filename)}
                    </p>
                  </div>
                  <div className="relative aspect-square w-full bg-muted/20">
                    {entry.status === "pending" && phase === "loading" ? (
                      <Skeleton className="absolute inset-0 z-0 size-full rounded-none" />
                    ) : null}
                    {entry.status === "pending" && phase !== "loading" ? (
                      <div className="flex size-full items-center justify-center p-2 text-center text-xs text-muted-foreground">
                        Waiting…
                      </div>
                    ) : null}
                    {entry.status === "ok" && entry.imageSrc ? (
                      <button
                        type="button"
                        className="group relative z-10 flex size-full cursor-zoom-in flex-col items-stretch border-0 bg-transparent p-0 text-left outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
                        onClick={() =>
                          setLightbox({
                            src: entry.imageSrc!,
                            title: shortName(filename),
                          })
                        }
                        aria-label={`Open larger view for ${shortName(filename)}`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element -- data URL from API */}
                        <img
                          src={entry.imageSrc}
                          alt={`Grad CAM heatmap for ${shortName(filename)}`}
                          className="size-full object-contain"
                        />
                        <span className="pointer-events-none absolute bottom-1 right-1 flex items-center gap-0.5 rounded bg-background/85 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground shadow-sm opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                          <Maximize2 className="size-3" aria-hidden />
                          Enlarge
                        </span>
                      </button>
                    ) : null}
                    {entry.status === "error" ? (
                      <div className="relative z-10 flex size-full flex-col items-center justify-center gap-1 p-2 text-center">
                        <ImageIcon className="size-8 text-muted-foreground/60" aria-hidden />
                        <p className="text-[11px] leading-snug text-muted-foreground">
                          {entry.error ?? "Grad CAM unavailable"}
                        </p>
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

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
            aria-labelledby="gradcam-lightbox-title"
          >
            <div className="flex flex-col gap-3 border-b border-border/60 px-4 py-3 sm:flex-row sm:items-start sm:justify-between sm:px-5">
              <div className="min-w-0 flex-1">
                <h2
                  id="gradcam-lightbox-title"
                  className="truncate text-base font-semibold text-foreground"
                >
                  {lightbox.title}
                </h2>
                <p className="text-xs text-muted-foreground">
                  Grad CAM heatmap · explainability only
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
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Model attention
                </p>
                <div className="relative w-full min-h-[min(40vh,320px)]">
                  {/* eslint-disable-next-line @next/next/no-img-element -- data URL from API */}
                  <img
                    src={lightbox.src}
                    alt={`Grad CAM heatmap for ${lightbox.title}`}
                    className={HISTORY_DETAIL_IMG_CLASS}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
