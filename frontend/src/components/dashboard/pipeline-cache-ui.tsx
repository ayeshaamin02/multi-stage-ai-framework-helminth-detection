"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { ChevronDown, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { useState } from "react";

export function PipelineCacheHitBanner({
  cacheSourceCreatedAt,
  onRunAgain,
}: {
  cacheSourceCreatedAt: string | null;
  onRunAgain: () => void;
}) {
  const label = cacheSourceCreatedAt
    ? `Cached from ${new Date(cacheSourceCreatedAt).toLocaleString()}`
    : "Loaded from cache";

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/25 bg-primary/10 px-3 py-2 text-sm"
    >
      <p className="text-foreground">
        <Sparkles className="mr-1.5 inline size-4 text-primary" aria-hidden />
        {label}. Predictions were reused; no model batch ran.
      </p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 gap-1.5 border-primary/30 bg-background/80"
        onClick={onRunAgain}
      >
        <RefreshCw className="size-3.5" aria-hidden />
        Run again
      </Button>
    </motion.div>
  );
}

export function GenerateExplanationsCard({
  busy,
  onStart,
}: {
  busy: boolean;
  onStart: () => void;
}) {
  return (
    <Card className="border-dashed border-primary/30 bg-primary/[0.04]">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Generate explanations (optional)</CardTitle>
        <CardDescription>
          This run used cached predictions to save compute. GradCAM and LIME heatmaps
          are not generated automatically — start them when you want explainability
          overlays.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button
          type="button"
          className="gap-1.5"
          disabled={busy}
          onClick={onStart}
        >
          {busy ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Starting explanation jobs…
            </>
          ) : (
            "Generate explanations"
          )}
        </Button>
      </CardContent>
    </Card>
  );
}

export function ForceFreshPredictionToggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <motion.div
      initial={false}
      className="mx-auto w-full max-w-md text-left"
    >
      <button
        type="button"
        className="flex w-full items-center justify-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        Advanced
        <ChevronDown
          className={cn("size-3.5 transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>
      {open ? (
        <label className="mt-2 flex cursor-pointer items-start gap-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5 text-xs text-muted-foreground">
          <input
            type="checkbox"
            className="mt-0.5 size-3.5 rounded border-input accent-primary"
            checked={checked}
            disabled={disabled}
            onChange={(e) => onChange(e.target.checked)}
          />
          <span>
            Force fresh prediction (ignore cache). Use when you changed models or
            need a full re-run even for the same image bytes.
          </span>
        </label>
      ) : null}
    </motion.div>
  );
}
