"use client";

import { cn } from "@/lib/utils";
import { motion, useReducedMotion } from "framer-motion";
import { History, ImagePlus } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useId, useState } from "react";

export type DashboardTab = "predict" | "history";

type DashboardTabsProps = {
  initialTab: DashboardTab;
  predictTab: ReactNode;
  historyTab: ReactNode;
};

const TABS: Array<{
  id: DashboardTab;
  label: string;
  icon: typeof History;
}> = [
  { id: "predict", label: "Predict", icon: ImagePlus },
  { id: "history", label: "History", icon: History },
];

/**
 * Tabs that keep both panels MOUNTED across switches (via the `hidden` attribute
 * on inactive panels). This preserves WebSocket and progress state in the predict
 * panel when the user peeks at history. Tab selection is purely client state; the
 * URL is not updated on switch.
 *
 * Visual cue for tab change is the sliding indicator pill (framer layoutId), not
 * a panel cross-fade \u2014 because cross-fading would require unmounting one panel.
 *
 * External components can imperatively switch tabs by dispatching:
 *   window.dispatchEvent(new CustomEvent("dashboard:set-tab", { detail: { tab: "predict" }}))
 */
export function DashboardTabs({
  initialTab,
  predictTab,
  historyTab,
}: DashboardTabsProps) {
  const [active, setActive] = useState<DashboardTab>(initialTab);
  const reduceMotion = useReducedMotion();
  const indicatorId = useId();

  useEffect(() => {
    const onSetTab = (e: Event) => {
      const evt = e as CustomEvent<{ tab?: DashboardTab }>;
      if (evt.detail?.tab === "predict" || evt.detail?.tab === "history") {
        setActive(evt.detail.tab);
      }
    };
    window.addEventListener("dashboard:set-tab", onSetTab as EventListener);
    return () =>
      window.removeEventListener(
        "dashboard:set-tab",
        onSetTab as EventListener,
      );
  }, []);

  return (
    <div>
      <div
        role="tablist"
        aria-label="Dashboard sections"
        className="mx-auto mb-6 flex w-full max-w-sm items-center gap-1 rounded-xl border border-border/70 bg-card p-1 shadow-sm"
      >
        {TABS.map((t) => {
          const Icon = t.icon;
          const isActive = active === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls={`dashboard-panel-${t.id}`}
              id={`dashboard-tab-${t.id}`}
              onClick={() => setActive(t.id)}
              className={cn(
                "relative inline-flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {isActive ? (
                reduceMotion ? (
                  <span className="absolute inset-0 rounded-lg bg-primary shadow-sm" />
                ) : (
                  <motion.span
                    layoutId={indicatorId}
                    className="absolute inset-0 rounded-lg bg-primary shadow-sm"
                    transition={{ type: "spring", stiffness: 380, damping: 32 }}
                  />
                )
              ) : null}
              <span className="relative z-10 inline-flex items-center gap-2">
                <Icon className="size-4" aria-hidden />
                {t.label}
              </span>
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id="dashboard-panel-predict"
        aria-labelledby="dashboard-tab-predict"
        hidden={active !== "predict"}
      >
        {predictTab}
      </div>
      <div
        role="tabpanel"
        id="dashboard-panel-history"
        aria-labelledby="dashboard-tab-history"
        hidden={active !== "history"}
      >
        {historyTab}
      </div>
    </div>
  );
}
