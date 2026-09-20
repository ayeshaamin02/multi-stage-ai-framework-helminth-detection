"use client";

import { cn } from "@/lib/utils";
import { motion, useReducedMotion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import {
  ClipboardList,
  Layers,
  Microscope,
  ScanSearch,
} from "lucide-react";
import { Fragment, useEffect, useState } from "react";

const easeOut = [0.22, 1, 0.36, 1] as const;

type Step = {
  label: string;
  detail: string;
  icon: LucideIcon;
  stage: number | null;
};

const STEPS: Step[] = [
  {
    label: "Fecal Classification",
    detail: "7 model ensemble vote",
    icon: Microscope,
    stage: 1,
  },
  {
    label: "Helminth Screening",
    detail: "Binary classifier gates Stage 3",
    icon: Layers,
    stage: 2,
  },
  {
    label: "Species Identification",
    detail: "11 class bounding boxes",
    icon: ScanSearch,
    stage: 3,
  },
  {
    label: "Review",
    detail: "Annotated image saved",
    icon: ClipboardList,
    stage: null,
  },
];

type PredictStatusEvent = CustomEvent<{ running: boolean; stage: number | null }>;

/**
 * Compact horizontal pipeline strip. Lives above the Predict / History tabs,
 * always visible. Reacts to `predict:status` events emitted by HelminthPredictPanel
 * by highlighting the currently running stage.
 */
export function DashboardPipelineTimeline() {
  const reduceMotion = useReducedMotion();
  const [activeStage, setActiveStage] = useState<number | null>(null);

  useEffect(() => {
    const onStatus = (e: Event) => {
      const evt = e as PredictStatusEvent;
      setActiveStage(evt.detail?.stage ?? null);
    };
    window.addEventListener("predict:status", onStatus as EventListener);
    return () =>
      window.removeEventListener(
        "predict:status",
        onStatus as EventListener,
      );
  }, []);

  return (
    <ol className="flex w-full items-start">
      {STEPS.map((step, i) => {
        const Icon = step.icon;
        const isActive = step.stage !== null && activeStage === step.stage;
        const isLast = i === STEPS.length - 1;
        const Wrapper = reduceMotion ? "li" : motion.li;
        const wrapperMotion = reduceMotion
          ? { className: "flex min-w-0 flex-[1.6] flex-col items-center px-1 text-center" }
          : {
              className: "flex min-w-0 flex-[1.6] flex-col items-center px-1 text-center",
              initial: { opacity: 0, y: 6 },
              animate: { opacity: 1, y: 0 },
              transition: {
                duration: 0.4,
                ease: easeOut,
                delay: 0.05 + i * 0.06,
              },
            };

        return (
          <Fragment key={step.label}>
            <Wrapper {...wrapperMotion}>
              {/* Node circle */}
              <span
                className={cn(
                  "relative flex size-9 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                  isActive
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-muted-foreground",
                )}
              >
                <Icon className="size-4" aria-hidden />
                {isActive && !reduceMotion ? (
                  <motion.span
                    aria-hidden
                    className="absolute inset-0 -z-10 rounded-full bg-primary/40"
                    animate={{ scale: [1, 1.6], opacity: [0.55, 0] }}
                    transition={{
                      duration: 1.4,
                      repeat: Infinity,
                      ease: "easeOut",
                    }}
                  />
                ) : null}
              </span>
              {/* Label */}
              <p
                className={cn(
                  "mt-1.5 w-full truncate text-xs font-medium leading-tight",
                  isActive ? "text-primary" : "text-foreground/90",
                )}
                title={step.label}
              >
                {step.label}
              </p>
              <p
                className="mt-0.5 hidden w-full truncate text-[10px] leading-tight text-muted-foreground sm:block"
                title={step.detail}
              >
                {step.detail}
              </p>
              {isActive ? (
                <span className="mt-1 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                  Running
                </span>
              ) : null}
            </Wrapper>
            {/* Connector line between nodes (not after the last one). */}
            {!isLast ? (
              <span
                aria-hidden
                className={cn(
                  "mt-[18px] h-0.5 flex-1 rounded-full transition-colors",
                  isActive ? "bg-primary/40" : "bg-border",
                )}
              />
            ) : null}
          </Fragment>
        );
      })}
    </ol>
  );
}
