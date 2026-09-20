"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { motion, useReducedMotion } from "framer-motion";
import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  Info,
  RefreshCcw,
} from "lucide-react";

type VoteLike = {
  totalModels: number;
  positiveVotes: number;
  negativeVotes: number;
};

export type PipelineOutcome =
  | { kind: "stage1_non_fecal"; vote: VoteLike }
  | { kind: "stage2_no_helminth"; vote: VoteLike }
  | { kind: "stage3_complete"; detectionCount: number }
  | { kind: "failed"; stage: 1 | 2 | 3 | null; message: string };

type PipelineOutcomeBannerProps = {
  outcome: PipelineOutcome;
  onReset: () => void;
};

const easeOut = [0.22, 1, 0.36, 1] as const;

export function PipelineOutcomeBanner({
  outcome,
  onReset,
}: PipelineOutcomeBannerProps) {
  const reduceMotion = useReducedMotion();
  const visual = pickVisual(outcome);
  const Icon = visual.icon;

  const Wrapper = reduceMotion ? "div" : motion.div;
  const wrapperMotion = reduceMotion
    ? {}
    : {
        initial: { opacity: 0, y: 8 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.32, ease: easeOut },
      };

  return (
    <Wrapper {...wrapperMotion}>
      <div
        role="status"
        aria-live="polite"
        className={cn(
          "flex flex-col gap-3 rounded-xl border px-4 py-3.5 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:gap-4",
          visual.container,
        )}
      >
        <div className="flex items-start gap-3">
          <span
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-full",
              visual.iconBg,
            )}
            aria-hidden
          >
            <Icon className="size-4" />
          </span>
          <div className="min-w-0">
            <p
              className={cn(
                "text-sm font-semibold leading-tight",
                visual.titleColor,
              )}
            >
              {visual.title}
            </p>
            <p className={cn("mt-0.5 text-sm leading-snug", visual.bodyColor)}>
              {visual.reason}
            </p>
            {visual.detail ? (
              <p
                className={cn(
                  "mt-1 text-xs leading-snug",
                  visual.detailColor,
                )}
              >
                {visual.detail}
              </p>
            ) : null}
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="shrink-0 gap-1.5 self-start sm:self-center"
          onClick={onReset}
        >
          <RefreshCcw className="size-3.5" aria-hidden />
          Start a new prediction
        </Button>
      </div>
    </Wrapper>
  );
}

type Visual = {
  icon: typeof CheckCircle2;
  container: string;
  iconBg: string;
  titleColor: string;
  bodyColor: string;
  detailColor: string;
  title: string;
  reason: string;
  detail: string | null;
};

function pickVisual(outcome: PipelineOutcome): Visual {
  if (outcome.kind === "stage3_complete") {
    return {
      icon: CheckCircle2,
      container:
        "border-emerald-500/40 bg-emerald-500/10 dark:border-emerald-400/40 dark:bg-emerald-400/10",
      iconBg:
        "bg-emerald-500/20 text-emerald-700 dark:bg-emerald-400/20 dark:text-emerald-300",
      titleColor: "text-emerald-900 dark:text-emerald-100",
      bodyColor: "text-emerald-900/90 dark:text-emerald-100/90",
      detailColor: "text-emerald-900/70 dark:text-emerald-100/70",
      title: "Pipeline complete",
      reason:
        outcome.detectionCount > 0
          ? `Stage 3 species localization saved · ${outcome.detectionCount} detection${outcome.detectionCount === 1 ? "" : "s"}.`
          : "Stage 3 species localization saved · no objects above the confidence threshold.",
      detail: "Results were written to your prediction history.",
    };
  }

  if (outcome.kind === "stage1_non_fecal") {
    const { positiveVotes, negativeVotes, totalModels } = outcome.vote;
    return {
      icon: Info,
      container:
        "border-amber-500/40 bg-amber-500/10 dark:border-amber-400/40 dark:bg-amber-400/10",
      iconBg:
        "bg-amber-500/20 text-amber-700 dark:bg-amber-400/20 dark:text-amber-300",
      titleColor: "text-amber-900 dark:text-amber-100",
      bodyColor: "text-amber-900/90 dark:text-amber-100/90",
      detailColor: "text-amber-900/70 dark:text-amber-100/70",
      title: "Process ended at Stage 1",
      reason: "Stopped because of Non fecal.",
      detail: `Fecal votes: ${positiveVotes} · Non fecal votes: ${negativeVotes} (out of ${totalModels} models). Stages 2 and 3 were skipped.`,
    };
  }

  if (outcome.kind === "stage2_no_helminth") {
    const { positiveVotes, negativeVotes, totalModels } = outcome.vote;
    return {
      icon: Info,
      container:
        "border-amber-500/40 bg-amber-500/10 dark:border-amber-400/40 dark:bg-amber-400/10",
      iconBg:
        "bg-amber-500/20 text-amber-700 dark:bg-amber-400/20 dark:text-amber-300",
      titleColor: "text-amber-900 dark:text-amber-100",
      bodyColor: "text-amber-900/90 dark:text-amber-100/90",
      detailColor: "text-amber-900/70 dark:text-amber-100/70",
      title: "Process ended at Stage 2",
      reason: "Stopped because of Non Helminth.",
      detail: `Helminth votes: ${positiveVotes} · Non Helminth votes: ${negativeVotes} (out of ${totalModels} models). Stage 3 was skipped.`,
    };
  }

  const stageLabel =
    outcome.stage === null ? "the pipeline" : `Stage ${outcome.stage}`;
  return {
    icon: outcome.stage === null ? AlertOctagon : AlertTriangle,
    container:
      "border-destructive/40 bg-destructive/10 dark:border-destructive/50 dark:bg-destructive/15",
    iconBg: "bg-destructive/20 text-destructive",
    titleColor: "text-destructive",
    bodyColor: "text-destructive/90",
    detailColor: "text-destructive/70",
    title: `Process failed at ${stageLabel}`,
    reason: outcome.message || "An unexpected error occurred.",
    detail: null,
  };
}
