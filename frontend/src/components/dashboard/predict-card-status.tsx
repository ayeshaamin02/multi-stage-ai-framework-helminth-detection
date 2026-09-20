"use client";

import { cn } from "@/lib/utils";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";

type PredictStatusEvent = CustomEvent<{ running: boolean; stage: number | null }>;

export function PredictCardStatus({ className }: { className?: string }) {
  const reduceMotion = useReducedMotion();
  const [running, setRunning] = useState(false);
  const [stage, setStage] = useState<number | null>(null);

  useEffect(() => {
    const onStatus = (e: Event) => {
      const evt = e as PredictStatusEvent;
      setRunning(!!evt.detail?.running);
      setStage(evt.detail?.stage ?? null);
    };
    window.addEventListener("predict:status", onStatus as EventListener);
    return () =>
      window.removeEventListener("predict:status", onStatus as EventListener);
  }, []);

  const label = running ? `Stage ${stage} running…` : "Pipeline idle";

  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/80 px-2.5 py-1 text-xs font-medium",
        running
          ? "text-emerald-700 dark:text-emerald-400"
          : "text-muted-foreground",
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <span className="relative flex size-2.5 items-center justify-center">
        {running && !reduceMotion ? (
          <motion.span
            className="absolute inline-flex size-2.5 rounded-full bg-emerald-500/70"
            animate={{ scale: [1, 2.2, 1], opacity: [0.7, 0, 0.7] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }}
          />
        ) : null}
        <span
          className={cn(
            "relative inline-flex size-2 rounded-full",
            running ? "bg-emerald-500" : "bg-muted-foreground/60",
          )}
        />
      </span>
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={label}
          initial={{ opacity: 0, y: 2 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -2 }}
          transition={{ duration: 0.18 }}
        >
          {label}
        </motion.span>
      </AnimatePresence>
    </div>
  );
}
