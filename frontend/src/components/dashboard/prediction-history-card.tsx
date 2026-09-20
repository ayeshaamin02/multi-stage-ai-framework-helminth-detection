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
import type { PredictionPipelineRunRow } from "@/lib/pipeline-db";
import { summarizePipelineRun } from "@/lib/pipeline-summary";
import { cn } from "@/lib/utils";
import { motion, useReducedMotion } from "framer-motion";
import {
  ChevronRight,
  History as HistoryIcon,
  ImageOff,
  Inbox,
  RefreshCcw,
} from "lucide-react";
import { HistoryThumbnail } from "@/components/dashboard/history-thumbnail";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
} from "react";

const HISTORY_PAGE_SIZE = 30;
const HISTORY_VISIBLE_STEP = 10;

const easeOut = [0.22, 1, 0.36, 1] as const;

type PredictionHistoryCardProps = {
  initialHistory: PredictionPipelineRunRow[];
  predictionApiDelegateToken: string | null;
  className?: string;
};

type OutcomeFilter =
  | "all"
  | "finished"
  | "failed"
  | "non_fecal"
  | "helminth_positive"
  | "helminth_negative"
  | "stage3_finished";

type DateFilter = "all" | "today" | "7d" | "30d";

const OUTCOME_CHIPS: Array<{ id: OutcomeFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "finished", label: "Finished" },
  { id: "stage3_finished", label: "Stage 3 complete" },
  { id: "helminth_positive", label: "Helminth +" },
  { id: "helminth_negative", label: "Helminth \u2212" },
  { id: "non_fecal", label: "Non fecal" },
  { id: "failed", label: "Failed" },
];

const DATE_CHIPS: Array<{ id: DateFilter; label: string }> = [
  { id: "all", label: "Any time" },
  { id: "today", label: "Today" },
  { id: "7d", label: "Last 7 days" },
  { id: "30d", label: "Last 30 days" },
];

function startOfTodayMs(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function rowMatchesOutcome(
  row: PredictionPipelineRunRow,
  f: OutcomeFilter,
): boolean {
  if (f === "all") return true;
  if (f === "finished") return row.status === "finished";
  if (f === "failed") return row.status === "failed";
  if (f === "non_fecal") return row.final_outcome === "non_fecal";
  if (f === "helminth_positive") return row.final_outcome === "helminth_positive";
  if (f === "helminth_negative") return row.final_outcome === "helminth_negative";
  if (f === "stage3_finished") return row.stage3_status === "finished";
  return true;
}

function rowMatchesDate(row: PredictionPipelineRunRow, f: DateFilter): boolean {
  if (f === "all") return true;
  const created = new Date(row.created_at).getTime();
  const now = Date.now();
  if (f === "today") return created >= startOfTodayMs();
  if (f === "7d") return created >= now - 7 * 86400000;
  if (f === "30d") return created >= now - 30 * 86400000;
  return true;
}

type StatusTone = "success" | "warn" | "danger" | "muted";
function statusTone(row: PredictionPipelineRunRow): StatusTone {
  if (row.status === "failed") return "danger";
  if (row.final_outcome === "helminth_positive") return "warn";
  if (row.final_outcome === "helminth_negative") return "success";
  if (row.final_outcome === "non_fecal") return "muted";
  if (row.status === "finished") return "success";
  return "muted";
}

const TONE_DOT: Record<StatusTone, string> = {
  success: "bg-emerald-500 ring-emerald-500/30",
  warn: "bg-amber-500 ring-amber-500/30",
  danger: "bg-destructive ring-destructive/30",
  muted: "bg-muted-foreground/60 ring-muted-foreground/20",
};

const TONE_LABEL: Record<StatusTone, string> = {
  success: "Done",
  warn: "Helminth +",
  danger: "Failed",
  muted: "—",
};

export function PredictionHistoryCard({
  initialHistory,
  predictionApiDelegateToken,
  className,
}: PredictionHistoryCardProps) {
  const delegateAuthHeaders = useMemo(
    () =>
      predictionApiDelegateToken
        ? { Authorization: `Bearer ${predictionApiDelegateToken}` }
        : undefined,
    [predictionApiDelegateToken],
  );
  const [history, setHistory] =
    useState<PredictionPipelineRunRow[]>(initialHistory);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyVisibleCount, setHistoryVisibleCount] = useState(
    Math.min(HISTORY_VISIBLE_STEP, initialHistory.length),
  );
  const [historyOffset, setHistoryOffset] = useState(initialHistory.length);
  const [historyHasMore, setHistoryHasMore] = useState(
    initialHistory.length >= HISTORY_PAGE_SIZE,
  );
  const [outcomeFilter, setOutcomeFilter] = useState<OutcomeFilter>("all");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");

  const filteredHistory = useMemo(
    () =>
      history.filter(
        (row) =>
          rowMatchesOutcome(row, outcomeFilter) &&
          rowMatchesDate(row, dateFilter),
      ),
    [history, outcomeFilter, dateFilter],
  );

  const loadHistory = useCallback(
    async (opts?: { append?: boolean }) => {
      const append = opts?.append ?? false;
      setHistoryLoading(true);
      try {
        const offset = append ? historyOffset : 0;
        const res = await fetch(
          `/api/predictions/pipeline-run/history?limit=${HISTORY_PAGE_SIZE}&offset=${offset}`,
          {
            credentials: "include",
            headers: delegateAuthHeaders,
          },
        );
        const data = (await res.json()) as {
          items?: PredictionPipelineRunRow[];
        };
        if (!res.ok || !data.items) return;
        const items = data.items;

        if (append) {
          setHistory((prev) => [...prev, ...items]);
          setHistoryOffset((prev) => prev + items.length);
          setHistoryHasMore(items.length >= HISTORY_PAGE_SIZE);
          setHistoryVisibleCount((prev) => prev + HISTORY_VISIBLE_STEP);
          return;
        }

        setHistory(items);
        setHistoryOffset(items.length);
        setHistoryHasMore(items.length >= HISTORY_PAGE_SIZE);
        setHistoryVisibleCount(Math.min(HISTORY_VISIBLE_STEP, items.length));
      } finally {
        setHistoryLoading(false);
      }
    },
    [delegateAuthHeaders, historyOffset],
  );

  useEffect(() => {
    setHistory(initialHistory);
    setHistoryOffset(initialHistory.length);
    setHistoryHasMore(initialHistory.length >= HISTORY_PAGE_SIZE);
    setHistoryVisibleCount(
      Math.min(HISTORY_VISIBLE_STEP, initialHistory.length),
    );
  }, [initialHistory]);

  useEffect(() => {
    const onSaved = () => {
      void loadHistory();
    };
    window.addEventListener("pipeline-run-saved", onSaved);
    return () => {
      window.removeEventListener("pipeline-run-saved", onSaved);
    };
  }, [loadHistory]);

  useEffect(() => {
    setHistoryVisibleCount((prev) =>
      Math.min(
        Math.max(HISTORY_VISIBLE_STEP, prev),
        Math.max(filteredHistory.length, 1),
      ),
    );
  }, [outcomeFilter, dateFilter, filteredHistory.length]);

  const visibleHistory = filteredHistory.slice(0, historyVisibleCount);
  const canLoadMoreHistory =
    historyVisibleCount < filteredHistory.length ||
    (historyHasMore && historyVisibleCount >= filteredHistory.length);

  const handleLoadMoreHistory = async () => {
    if (historyVisibleCount < filteredHistory.length) {
      setHistoryVisibleCount((prev) => prev + HISTORY_VISIBLE_STEP);
      return;
    }
    if (historyHasMore && !historyLoading) {
      await loadHistory({ append: true });
    }
  };

  return (
    <Card
      className={cn(
        "overflow-hidden border-border/80 shadow-sm transition-shadow duration-300 hover:shadow-md",
        className,
      )}
    >
      <CardHeader>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <HistoryIcon className="size-5 text-primary" aria-hidden />
              Prediction history
            </CardTitle>
            <CardDescription>
              Filter, then open any run to see image, detections, and download
              options.
            </CardDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5 sm:self-start"
            disabled={historyLoading}
            onClick={() => void loadHistory()}
          >
            <RefreshCcw
              className={cn(
                "size-3.5",
                historyLoading && "animate-spin",
              )}
              aria-hidden
            />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <ChipGroup
          label="Outcome"
          chips={OUTCOME_CHIPS}
          active={outcomeFilter}
          onChange={setOutcomeFilter}
        />
        <ChipGroup
          label="Date"
          chips={DATE_CHIPS}
          active={dateFilter}
          onChange={setDateFilter}
        />

        {historyLoading && history.length === 0 ? (
          <div className="space-y-2">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : history.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title="No saved runs yet"
            description="Complete a screening from the Predict tab to see it here."
          />
        ) : filteredHistory.length === 0 ? (
          <EmptyState
            icon={ImageOff}
            title="No runs match these filters"
            description="Try All outcomes or a wider date range."
          />
        ) : (
          <>
            <ul className="space-y-2.5">
              {visibleHistory.map((row, i) => (
                <HistoryRow key={row.id} row={row} index={i} />
              ))}
            </ul>
            {canLoadMoreHistory ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={historyLoading}
                onClick={() => void handleLoadMoreHistory()}
                className="w-full"
              >
                {historyLoading ? "Loading…" : "Load 10 more"}
              </Button>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function ChipGroup<T extends string>({
  label,
  chips,
  active,
  onChange,
}: {
  label: string;
  chips: Array<{ id: T; label: string }>;
  active: T;
  onChange: (next: T) => void;
}) {
  const reduceMotion = useReducedMotion();
  const layoutId = useId();
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {chips.map((c) => {
          const isActive = active === c.id;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => onChange(c.id)}
              className={cn(
                "relative inline-flex items-center rounded-full px-3 py-1 text-xs font-medium transition-colors",
                isActive
                  ? "text-primary-foreground"
                  : "border border-border/70 bg-background/80 text-muted-foreground hover:bg-muted/40 hover:text-foreground",
              )}
              aria-pressed={isActive}
            >
              {isActive ? (
                reduceMotion ? (
                  <span className="absolute inset-0 rounded-full bg-primary" />
                ) : (
                  <motion.span
                    layoutId={layoutId}
                    className="absolute inset-0 rounded-full bg-primary"
                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                  />
                )
              ) : null}
              <span className="relative z-10">{c.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function HistoryRow({
  row,
  index,
}: {
  row: PredictionPipelineRunRow;
  index: number;
}) {
  const reduceMotion = useReducedMotion();
  const thumbSrc = row.stage3_annotated_image_object_key
    ? `/api/predictions/pipeline-run/${row.id}/image/stage3-annotated`
    : row.image_object_key
      ? `/api/predictions/pipeline-run/${row.id}/image`
      : null;
  const thumbIsAnnotated = Boolean(row.stage3_annotated_image_object_key);
  const tone = statusTone(row);
  const Wrapper = reduceMotion ? "li" : motion.li;
  const wrapperMotion = reduceMotion
    ? {}
    : {
        initial: { opacity: 0, y: 6 },
        animate: { opacity: 1, y: 0 },
        transition: {
          duration: 0.32,
          ease: easeOut,
          delay: Math.min(index * 0.025, 0.2),
        },
      };

  return (
    <Wrapper {...wrapperMotion}>
      <Link
        href={`/dashboard/history/${row.id}`}
        prefetch={false}
        className={cn(
          "group flex items-stretch gap-3 rounded-xl border border-border/60 bg-background/80 p-3 text-left text-sm transition-all",
          "hover:-translate-y-px hover:border-primary/35 hover:bg-muted/25 hover:shadow-sm",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        )}
      >
        <div className="relative shrink-0">
          {thumbSrc ? (
            <HistoryThumbnail
              src={thumbSrc}
              alt={row.original_filename ?? "Prediction image"}
              filename={row.original_filename}
              isAnnotatedPng={thumbIsAnnotated}
            />
          ) : (
            <div className="flex size-20 items-center justify-center rounded-lg border border-dashed border-border/70 bg-muted/30 text-muted-foreground">
              <ImageOff className="size-5" aria-hidden />
            </div>
          )}
          <span
            aria-label={TONE_LABEL[tone]}
            className={cn(
              "absolute -bottom-1 -right-1 size-3.5 rounded-full ring-4 ring-background",
              TONE_DOT[tone],
            )}
            title={TONE_LABEL[tone]}
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="truncate font-medium text-foreground">
              {row.original_filename ?? "Untitled"}
            </span>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              S1 {row.stage1_status} · S2 {row.stage2_status} · S3 {row.stage3_status}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {new Date(row.created_at).toLocaleString()} · {row.status}
            {row.final_outcome ? ` · ${row.final_outcome}` : ""}
          </p>
          <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-foreground/90">
            {summarizePipelineRun(row)}
          </p>
        </div>
        <ChevronRight
          className="mt-2 size-4 shrink-0 self-start text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground"
          aria-hidden
        />
      </Link>
    </Wrapper>
  );
}

function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Inbox;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border/70 bg-muted/15 px-4 py-12 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon className="size-5" aria-hidden />
      </div>
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="max-w-md text-xs text-muted-foreground">{description}</p>
    </div>
  );
}
