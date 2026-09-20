"use client";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { motion, useReducedMotion } from "framer-motion";
import { Bug, ClipboardList, Layers, Microscope } from "lucide-react";
import type { ComponentType } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type DashboardStats = {
  totalPredictions: number;
  fecalDetectedStage1: number;
  helminthPositivePhase2: number;
  speciesDetectionsCount: number;
};

type DashboardLiveStatsProps = {
  initialStats: DashboardStats;
  predictionApiDelegateToken: string | null;
};

const easeOut = [0.22, 1, 0.36, 1] as const;

/** Animates an integer from 0 (or previous value) to `target` over `duration` ms.
 * When reduced motion is preferred, returns the target directly (no animation,
 * no setState-in-effect cascade). */
function useCountUp(target: number, duration = 900): number {
  const reduceMotion = useReducedMotion();
  const [value, setValue] = useState(0);
  const fromRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (reduceMotion) {
      fromRef.current = target;
      return;
    }
    const from = fromRef.current;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      // easeOutCubic
      const e = 1 - Math.pow(1 - t, 3);
      const next = Math.round(from + (target - from) * e);
      setValue(next);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = target;
        rafRef.current = null;
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [target, duration, reduceMotion]);

  return reduceMotion ? target : value;
}

export function DashboardLiveStats({
  initialStats,
  predictionApiDelegateToken,
}: DashboardLiveStatsProps) {
  const [stats, setStats] = useState<DashboardStats>(initialStats);
  const headers = useMemo(
    () =>
      predictionApiDelegateToken
        ? { Authorization: `Bearer ${predictionApiDelegateToken}` }
        : undefined,
    [predictionApiDelegateToken],
  );

  const refreshStats = useCallback(async () => {
    try {
      const res = await fetch("/api/predictions/pipeline-run/stats", {
        credentials: "include",
        headers,
      });
      const data = (await res.json()) as { stats?: DashboardStats };
      if (res.ok && data.stats) setStats(data.stats);
    } catch {
      /* keep last visible stats */
    }
  }, [headers]);

  useEffect(() => {
    setStats(initialStats);
  }, [initialStats]);

  useEffect(() => {
    void refreshStats();
    const onSaved = () => void refreshStats();
    window.addEventListener("pipeline-run-saved", onSaved);
    return () => window.removeEventListener("pipeline-run-saved", onSaved);
  }, [refreshStats]);

  const cards: Array<{
    icon: ComponentType<{ className?: string }>;
    label: string;
    value: number;
    hint: string;
    accentBar: string;
    accentIcon: string;
    accentIconBg: string;
  }> = [
    {
      icon: ClipboardList,
      label: "Total predictions",
      value: stats.totalPredictions,
      hint: "All-time finished pipeline runs",
      accentBar: "bg-chart-5 dark:bg-chart-1",
      accentIcon: "text-chart-5 dark:text-chart-1",
      accentIconBg: "bg-chart-1/55 dark:bg-chart-5/25",
    },
    {
      icon: Microscope,
      label: "Fecal detected",
      value: stats.fecalDetectedStage1,
      hint: "Stage 1 result = Fecal",
      accentBar: "bg-primary",
      accentIcon: "text-primary dark:text-primary-foreground",
      accentIconBg: "bg-primary/15 dark:bg-primary/30",
    },
    {
      icon: Layers,
      label: "Helminth found",
      value: stats.helminthPositivePhase2,
      hint: "Stage 2 result = Helminth",
      accentBar: "bg-chart-4 dark:bg-chart-2",
      accentIcon: "text-chart-4 dark:text-chart-2",
      accentIconBg: "bg-chart-2/45 dark:bg-chart-4/35",
    },
    {
      icon: Bug,
      label: "Species identified",
      value: stats.speciesDetectionsCount,
      hint: "Stage 3 bounding box instances",
      accentBar: "bg-chart-3 dark:bg-chart-1",
      accentIcon: "text-chart-3 dark:text-chart-1",
      accentIconBg: "bg-chart-2/30 dark:bg-chart-3/30",
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((c, i) => (
        <StatCard key={c.label} {...c} delay={0.05 + i * 0.08} />
      ))}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  accentBar,
  accentIcon,
  accentIconBg,
  delay,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: number;
  hint: string;
  accentBar: string;
  accentIcon: string;
  accentIconBg: string;
  delay: number;
}) {
  const reduceMotion = useReducedMotion();
  const animated = useCountUp(value);
  const Wrapper = reduceMotion ? "div" : motion.div;
  const wrapperMotion = reduceMotion
    ? { className: "h-full" }
    : {
        className: "h-full",
        initial: { opacity: 0, y: 12 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.45, ease: easeOut, delay },
      };

  return (
    <Wrapper {...wrapperMotion}>
      <Card className="relative h-full overflow-hidden border-border/80 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md">
        <span
          aria-hidden
          className={cn("absolute inset-y-0 left-0 w-1", accentBar)}
        />
        <CardContent className="flex flex-1 items-center justify-between gap-3 pl-4">
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {label}
            </p>
            <p className="mt-1 text-3xl font-bold tabular-nums tracking-tight text-foreground">
              {animated.toLocaleString()}
            </p>
            <p className="mt-1 line-clamp-2 text-xs leading-snug text-muted-foreground">
              {hint}
            </p>
          </div>
          <div
            className={cn(
              "flex size-10 shrink-0 items-center justify-center rounded-xl",
              accentIconBg,
            )}
          >
            <Icon className={cn("size-5", accentIcon)} />
          </div>
        </CardContent>
      </Card>
    </Wrapper>
  );
}
