"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { motion, useReducedMotion } from "framer-motion";
import { Activity, ArrowRight, CalendarRange, Sparkles } from "lucide-react";

type DashboardHeroProps = {
  userName?: string | null;
  runsThisWeek: number;
};

const easeOut = [0.22, 1, 0.36, 1] as const;

function fadeUp(delay = 0) {
  return {
    initial: { opacity: 0, y: 14 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.5, ease: easeOut, delay },
  };
}

export function DashboardHero({ userName, runsThisWeek }: DashboardHeroProps) {
  const reduceMotion = useReducedMotion();
  const Wrapper = reduceMotion ? "div" : motion.div;
  const wrapperMotion = reduceMotion ? {} : fadeUp(0);

  const handleStart = () => {
    window.dispatchEvent(
      new CustomEvent("dashboard:set-tab", { detail: { tab: "predict" } }),
    );
    requestAnimationFrame(() => {
      const target = document.getElementById("dashboard-predict-card");
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  };

  const greeting = userName ? `Welcome back, ${userName}` : "Welcome back";

  return (
    <Wrapper {...wrapperMotion}>
      <section
        aria-labelledby="dashboard-hero-heading"
        className={cn(
          "relative overflow-hidden rounded-2xl border border-border/70 bg-card p-6 shadow-sm sm:p-8",
        )}
      >
        {/* Decorative gradient layers (v4-friendly: utility-based, no theme()). */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/[0.08] via-transparent to-chart-2/[0.1]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-primary/15 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-32 -left-20 size-72 rounded-full bg-chart-2/15 blur-3xl"
        />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-muted-foreground [&_svg]:text-primary">
              <Activity className="size-3.5" aria-hidden />
              Clinician workspace
            </p>
            <h1
              id="dashboard-hero-heading"
              className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl"
            >
              {greeting}
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
              Upload a slide to run the full three stage pipeline. Switch to
              <span className="px-1 font-medium text-foreground">History</span>
              any time &mdash; your prediction keeps running.
            </p>
          </div>

          <div className="flex flex-col items-stretch gap-3 sm:items-end">
            <div
              className="inline-flex items-center gap-1.5 self-start rounded-full border border-border/70 bg-background/80 px-3 py-1 text-xs font-medium text-muted-foreground sm:self-end"
              title="Finished runs in the last 7 days"
            >
              <CalendarRange className="size-3.5 text-primary" aria-hidden />
              <span className="tabular-nums text-foreground">{runsThisWeek}</span>
              <span>runs this week</span>
            </div>
            <Button
              type="button"
              size="lg"
              className="group h-11 gap-2 px-5"
              onClick={handleStart}
            >
              <Sparkles className="size-4" aria-hidden />
              Start a new run
              <ArrowRight
                className="size-4 transition-transform group-hover:translate-x-0.5"
                aria-hidden
              />
            </Button>
          </div>
        </div>
      </section>
    </Wrapper>
  );
}
