"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { AlertCircle, Lightbulb, Loader2, Maximize2, Play, X } from "lucide-react";
import { useEffect, useState } from "react";

export type LimeRunEntry = {
  id: string;
  modelFilename: string;
  numSamples: number;
  status: "streaming" | "ok" | "error";
  imageSrc?: string;
  error?: string;
  startedAt: number;
  progressPct?: number | null;
};

export type StageLimeCardProps = {
  /** Title prefix, e.g. "Stage 1" or "Stage 2". */
  stageLabel: string;
  modelFilenames: readonly string[];
  shortName: (filename: string) => string;
  disabled: boolean;
  busy: boolean;
  history: LimeRunEntry[];
  onRun: (modelFilename: string, numSamples: number) => void;
  disabledReason?: string;
  /** When set, hide the model picker and always run LIME on this file. */
  fixedModelFilename?: string;
  fixedModelLabel?: string;
};

const MIN_SAMPLES = 10;
const MAX_SAMPLES = 1000;
const DEFAULT_SAMPLES = 250;
const STEP = 10;

const selectClass =
  "h-9 min-w-[14rem] rounded-md border border-input bg-background px-2 text-sm shadow-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40";

const HISTORY_DETAIL_IMG_CLASS =
  "relative z-10 mx-auto block h-auto max-h-[min(70vh,560px)] w-full rounded-lg border border-border/60 object-contain";

function formatTime(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function StageLimeCard({
  stageLabel,
  modelFilenames,
  shortName,
  disabled,
  busy,
  history,
  onRun,
  disabledReason,
  fixedModelFilename,
  fixedModelLabel,
}: StageLimeCardProps) {
  const [model, setModel] = useState<string>(modelFilenames[0] ?? "");
  const [samples, setSamples] = useState<number>(DEFAULT_SAMPLES);
  const [lightbox, setLightbox] = useState<{ src: string; title: string } | null>(
    null,
  );

  const effectiveModel = fixedModelFilename
    ? fixedModelFilename
    : model && modelFilenames.includes(model)
      ? model
      : (modelFilenames[0] ?? "");

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

  const submitDisabled = disabled || busy || !effectiveModel;

  return (
    <>
      <Card className="border-border/80">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Lightbulb className="size-4 text-amber-500" aria-hidden />
            {stageLabel} &middot; LIME explanations (optional)
          </CardTitle>
          <CardDescription>
            Run LIME on a {stageLabel} model to see which image regions drove its
            decision. Heatmaps are explainability only, not a diagnosis.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-xl border border-border/60 bg-muted/15 p-3.5">
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
              {fixedModelFilename ? (
                <div className="flex min-w-0 flex-col gap-1 text-xs text-muted-foreground">
                  <span>Detector for this run</span>
                  <span className="inline-flex w-fit rounded-full border border-border/60 bg-muted/30 px-2.5 py-1 font-medium text-foreground">
                    {fixedModelLabel ?? shortName(fixedModelFilename)}
                  </span>
                </div>
              ) : (
                <label className="flex min-w-0 flex-col gap-1 text-xs text-muted-foreground">
                  <span>{stageLabel} model</span>
                  <select
                    className={selectClass}
                    value={effectiveModel}
                    onChange={(e) => setModel(e.target.value)}
                    disabled={disabled || busy}
                  >
                    {modelFilenames.map((m) => (
                      <option key={m} value={m}>
                        {shortName(m)}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <div className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-muted-foreground sm:min-w-[16rem]">
                <div className="flex items-baseline justify-between gap-2">
                  <span>Number of samples</span>
                  <span
                    className="font-mono text-foreground tabular-nums"
                    aria-live="polite"
                  >
                    {samples}
                  </span>
                </div>
                <input
                  type="range"
                  min={MIN_SAMPLES}
                  max={MAX_SAMPLES}
                  step={STEP}
                  value={samples}
                  disabled={disabled || busy}
                  onChange={(e) => setSamples(Number(e.target.value))}
                  className="h-2 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label="Number of LIME samples"
                />
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>{MIN_SAMPLES}</span>
                  <span>{MAX_SAMPLES}</span>
                </div>
              </div>
              <Button
                type="button"
                size="default"
                className="h-9 shrink-0 gap-1.5 self-end"
                disabled={submitDisabled}
                onClick={() => onRun(effectiveModel, samples)}
              >
                {busy ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" aria-hidden />
                    Running…
                  </>
                ) : (
                  <>
                    <Play className="size-3.5" aria-hidden />
                    Run LIME
                  </>
                )}
              </Button>
            </div>
            <p className="mt-2 text-xs leading-snug text-muted-foreground">
              More samples produce a more reliable explanation but take longer.
              Capped at {MAX_SAMPLES} to protect the server.
            </p>
            {disabled && disabledReason ? (
              <p className="mt-2 text-xs leading-snug text-muted-foreground">
                {disabledReason}
              </p>
            ) : null}
          </div>

          {history.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border/60 bg-muted/10 px-3 py-4 text-center text-xs text-muted-foreground">
              No LIME explanations yet. Pick a model and run one.
            </p>
          ) : (
            <ul className="space-y-3">
              {history.map((entry) => {
                const canExpand =
                  entry.status === "ok" && Boolean(entry.imageSrc);
                return (
                  <li
                    key={entry.id}
                    className="overflow-hidden rounded-lg border border-border/60 bg-card"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 bg-muted/20 px-3 py-2 text-xs">
                      <div className="flex min-w-0 items-center gap-2">
                        <Lightbulb
                          className="size-3.5 shrink-0 text-amber-500"
                          aria-hidden
                        />
                        <span className="truncate font-mono text-[11px] font-medium text-foreground">
                          {shortName(entry.modelFilename)}
                        </span>
                        <span className="rounded-full bg-muted px-1.5 py-0.5 font-medium text-muted-foreground">
                          {entry.numSamples} samples
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <StatusPill status={entry.status} progress={entry.progressPct} />
                        <span>{formatTime(entry.startedAt)}</span>
                      </div>
                    </div>
                    <div className="relative flex min-h-[10rem] w-full items-center justify-center bg-muted/10">
                      {entry.status === "streaming" ? (
                        <>
                          <Skeleton className="absolute inset-0 z-0 size-full rounded-none" />
                          <div className="relative z-10 flex flex-col items-center gap-1 text-xs text-muted-foreground">
                            <Loader2
                              className="size-4 animate-spin"
                              aria-hidden
                            />
                            <p>Streaming LIME explanation…</p>
                          </div>
                        </>
                      ) : null}
                      {entry.status === "ok" && entry.imageSrc ? (
                        <button
                          type="button"
                          className={cn(
                            "group relative z-10 flex w-full flex-col items-stretch border-0 bg-transparent p-0 text-left outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring",
                            canExpand && "cursor-zoom-in",
                          )}
                          onClick={() =>
                            canExpand
                              ? setLightbox({
                                  src: entry.imageSrc!,
                                  title: `${shortName(entry.modelFilename)} · ${entry.numSamples} samples`,
                                })
                              : undefined
                          }
                          aria-label={`Open larger view for ${shortName(entry.modelFilename)} LIME explanation`}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element -- data URL from API */}
                          <img
                            src={entry.imageSrc}
                            alt={`LIME explanation for ${shortName(entry.modelFilename)}`}
                            className="block max-h-72 w-full object-contain"
                          />
                          <span className="pointer-events-none absolute bottom-1 right-1 flex items-center gap-0.5 rounded bg-background/85 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground shadow-sm opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                            <Maximize2 className="size-3" aria-hidden />
                            Enlarge
                          </span>
                        </button>
                      ) : null}
                      {entry.status === "error" ? (
                        <div className="relative z-10 flex items-start gap-2 px-3 py-3 text-sm text-destructive">
                          <AlertCircle
                            className="mt-0.5 size-4 shrink-0"
                            aria-hidden
                          />
                          <span>{entry.error ?? "LIME unavailable."}</span>
                        </div>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
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
            aria-labelledby="lime-lightbox-title"
          >
            <div className="flex flex-col gap-3 border-b border-border/60 px-4 py-3 sm:flex-row sm:items-start sm:justify-between sm:px-5">
              <div className="min-w-0 flex-1">
                <h2
                  id="lime-lightbox-title"
                  className="truncate text-base font-semibold text-foreground"
                >
                  {lightbox.title}
                </h2>
                <p className="text-xs text-muted-foreground">
                  LIME explanation · explainability only
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
                {/* eslint-disable-next-line @next/next/no-img-element -- data URL from API */}
                <img
                  src={lightbox.src}
                  alt={`LIME explanation for ${lightbox.title}`}
                  className={HISTORY_DETAIL_IMG_CLASS}
                />
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function StatusPill({
  status,
  progress,
}: {
  status: LimeRunEntry["status"];
  progress: number | null | undefined;
}) {
  if (status === "streaming") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
        <span className="size-1.5 animate-pulse rounded-full bg-primary" />
        {typeof progress === "number" ? `${progress}%` : "Running"}
      </span>
    );
  }
  if (status === "ok") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
        Done
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-destructive/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-destructive">
      Error
    </span>
  );
}
