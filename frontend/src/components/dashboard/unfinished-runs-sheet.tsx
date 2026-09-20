"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { UnfinishedRunItem } from "@/lib/unfinished-run-meta";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  Clock,
  Loader2,
  RefreshCcw,
  XCircle,
} from "lucide-react";

function formatRelativeTime(iso: string): string {
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return "Unknown time";
  const diffMs = Date.now() - ts;
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours} hr ago`;
  return new Date(ts).toLocaleString();
}

type UnfinishedRunsSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  runs: UnfinishedRunItem[];
  count: number;
  limit: number;
  canStartNew: boolean;
  busyRunId: string | null;
  bulkBusy: boolean;
  onRefresh: () => void;
  refreshing: boolean;
  onResume: (runId: string) => void;
  onCancel: (runId: string) => void;
  onCancelAllStale: () => void;
};

export function UnfinishedRunsSheet({
  open,
  onOpenChange,
  runs,
  count,
  limit,
  canStartNew,
  busyRunId,
  bulkBusy,
  onRefresh,
  refreshing,
  onResume,
  onCancel,
  onCancelAllStale,
}: UnfinishedRunsSheetProps) {
  const staleCount = runs.filter((run) => run.stale).length;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col sm:max-w-md">
        <SheetHeader className="border-b border-border/60 pb-4">
          <SheetTitle>Unfinished predictions</SheetTitle>
          <SheetDescription>
            You have {count} of {limit} active run slots in use. Cancel stalled
            runs to start a new upload, or resume one that may still be running.
          </SheetDescription>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto py-4">
          {runs.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
              No unfinished runs. You can start a new prediction.
            </div>
          ) : (
            runs.map((run) => (
              <UnfinishedRunCard
                key={run.id}
                run={run}
                busy={busyRunId === run.id}
                disabled={busyRunId !== null && busyRunId !== run.id}
                onResume={() => onResume(run.id)}
                onCancel={() => onCancel(run.id)}
              />
            ))
          )}
        </div>

        <SheetFooter className="border-t border-border/60 pt-4">
          <div className="flex w-full flex-col gap-2">
            {staleCount > 0 ? (
              <Button
                type="button"
                variant="outline"
                className="w-full cursor-pointer"
                disabled={bulkBusy || busyRunId !== null}
                onClick={() => onCancelAllStale()}
              >
                {bulkBusy ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <XCircle className="size-4" aria-hidden />
                )}
                Cancel {staleCount} stalled run{staleCount === 1 ? "" : "s"}
              </Button>
            ) : null}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1 cursor-pointer"
                disabled={refreshing || bulkBusy || busyRunId !== null}
                onClick={() => onRefresh()}
              >
                <RefreshCcw
                  className={cn("size-4", refreshing && "animate-spin")}
                  aria-hidden
                />
                Refresh
              </Button>
              <Button
                type="button"
                className="flex-1 cursor-pointer"
                disabled={!canStartNew}
                onClick={() => onOpenChange(false)}
              >
                {canStartNew ? "Continue" : "Free a slot first"}
              </Button>
            </div>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function UnfinishedRunCard({
  run,
  busy,
  disabled,
  onResume,
  onCancel,
}: {
  run: UnfinishedRunItem;
  busy: boolean;
  disabled: boolean;
  onResume: () => void;
  onCancel: () => void;
}) {
  return (
    <Card
      size="sm"
      className={cn(
        "ring-1",
        run.stale
          ? "border-amber-500/30 bg-amber-500/[0.04] ring-amber-500/20"
          : "ring-border/60",
      )}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="truncate text-sm">
              {run.originalFilename ?? "Untitled run"}
            </CardTitle>
            <CardDescription className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>{run.phaseLabel}</span>
              <span className="text-muted-foreground/70">·</span>
              <span className="inline-flex items-center gap-1">
                <Clock className="size-3" aria-hidden />
                {formatRelativeTime(run.updatedAt)}
              </span>
            </CardDescription>
          </div>
          {run.stale ? (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-800 dark:text-amber-200">
              <AlertTriangle className="size-3" aria-hidden />
              Stalled
            </span>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-2 pt-0">
        {run.staleReason ? (
          <p className="text-xs leading-relaxed text-amber-900/80 dark:text-amber-100/80">
            {run.staleReason}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            className="cursor-pointer"
            disabled={disabled || busy || !run.resumable}
            onClick={onResume}
          >
            {busy ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
            ) : (
              <RefreshCcw className="size-3.5" aria-hidden />
            )}
            Resume
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="cursor-pointer"
            disabled={disabled || busy}
            onClick={onCancel}
          >
            <XCircle className="size-3.5" aria-hidden />
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

type UnfinishedRunsBannerProps = {
  count: number;
  staleCount: number;
  onReview: () => void;
};

export function UnfinishedRunsBanner({
  count,
  staleCount,
  onReview,
}: UnfinishedRunsBannerProps) {
  if (count === 0) return null;

  return (
    <div
      role="status"
      className="flex flex-col gap-3 rounded-xl border border-amber-500/30 bg-amber-500/[0.06] px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-800 dark:text-amber-200">
          <AlertTriangle className="size-4" aria-hidden />
        </span>
        <div>
          <p className="text-sm font-semibold text-amber-950 dark:text-amber-50">
            You have {count} unfinished prediction{count === 1 ? "" : "s"}
          </p>
          <p className="mt-0.5 text-sm text-amber-900/80 dark:text-amber-100/80">
            {staleCount > 0
              ? `${staleCount} may be stalled after a service restart. Review them to free slots or resume.`
              : "These count toward your limit of 3 concurrent runs."}
          </p>
        </div>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="shrink-0 cursor-pointer border-amber-500/40 bg-background/80 hover:bg-background"
        onClick={onReview}
      >
        Review unfinished runs
      </Button>
    </div>
  );
}
