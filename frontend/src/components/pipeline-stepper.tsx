"use client";

import { Fragment } from "react";
import { cn } from "@/lib/utils";
import { motion, useReducedMotion } from "framer-motion";
import { Check, Layers, Microscope, Minus, ScanSearch } from "lucide-react";
import type { LucideIcon } from "lucide-react";

type StepStatus = "idle" | "active" | "complete" | "skipped";

type PipelineStepperProps = {
  steps?: { status: StepStatus }[];
  className?: string;
};

const STEPS: { label: string; subtitle: string; icon: LucideIcon }[] = [
  {
    label: "Fecal Classification",
    subtitle: "7 model vote",
    icon: Microscope,
  },
  {
    label: "Helminth Screening",
    subtitle: "Binary classifier",
    icon: Layers,
  },
  {
    label: "Helminth Species Identification",
    subtitle: "11 class detection",
    icon: ScanSearch,
  },
];

export function PipelineStepper({ steps, className }: PipelineStepperProps) {
  const reduceMotion = useReducedMotion();
  const statuses: StepStatus[] = steps
    ? steps.map((s) => s.status)
    : ["idle", "idle", "idle"];

  return (
    <div className={cn("flex w-full items-start", className)}>
      {STEPS.map((step, i) => {
        const status = statuses[i] ?? "idle";
        const Icon = step.icon;
        const isLast = i === STEPS.length - 1;
        const StepIcon =
          status === "complete" ? Check : status === "skipped" ? Minus : Icon;

        const segment = (
          <div className="flex w-0 min-w-0 flex-[1.25] flex-col items-center gap-1.5 text-center">
            <motion.div
              layout={!reduceMotion}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              className={cn(
                "flex size-9 shrink-0 items-center justify-center rounded-full border-2 transition-colors duration-300",
                status === "complete" &&
                  "border-emerald-600 bg-emerald-600 text-white dark:border-emerald-500 dark:bg-emerald-500",
                status === "active" &&
                  "border-primary bg-primary text-primary-foreground shadow-[0_0_0_4px] shadow-primary/20",
                status === "idle" &&
                  "border-border bg-muted text-muted-foreground",
                status === "skipped" &&
                  "border-dashed border-muted-foreground/35 bg-muted/40 text-muted-foreground/60",
              )}
            >
              <StepIcon className="size-4" aria-hidden />
            </motion.div>
            <div className="min-w-0">
              <p
                className={cn(
                  "text-xs font-medium leading-tight transition-colors duration-300",
                  status === "skipped"
                    ? "text-muted-foreground/60 line-through decoration-muted-foreground/40"
                    : status === "active"
                      ? "text-foreground"
                      : "text-foreground",
                )}
              >
                {step.label}
              </p>
              <p
                className={cn(
                  "mt-0.5 text-[10px] transition-colors duration-300",
                  status === "skipped"
                    ? "text-muted-foreground/50"
                    : "text-muted-foreground",
                )}
              >
                {status === "skipped" ? "Skipped" : step.subtitle}
              </p>
            </div>
          </div>
        );

        if (isLast) {
          return <Fragment key={step.label}>{segment}</Fragment>;
        }

        const nextStatus = statuses[i + 1] ?? "idle";
        const connectorActive =
          status === "complete" ||
          nextStatus === "complete" ||
          nextStatus === "active";
        const connectorSkipped =
          status === "skipped" || nextStatus === "skipped";
        const connector = (
          <div className="mt-[18px] flex h-0.5 min-w-6 flex-1 self-start px-1">
            <motion.div
              layout={!reduceMotion}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              className={cn(
                "h-full w-full rounded-full transition-colors duration-300",
                connectorActive && !connectorSkipped
                  ? "bg-emerald-600 dark:bg-emerald-500"
                  : status === "active"
                    ? "bg-primary/40"
                    : connectorSkipped
                      ? "bg-muted-foreground/20 bg-[length:6px_2px] bg-repeat-x"
                      : "bg-border",
              )}
            />
          </div>
        );

        return (
          <Fragment key={step.label}>
            {segment}
            {connector}
          </Fragment>
        );
      })}
    </div>
  );
}
