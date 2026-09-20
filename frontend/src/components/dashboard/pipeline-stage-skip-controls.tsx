"use client";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { FastForward } from "lucide-react";

export function PipelineStageSkipControls({
  skipStage1,
  skipStage2,
  onSkipStage1Change,
  onSkipStage2Change,
  disabled,
}: {
  skipStage1: boolean;
  skipStage2: boolean;
  onSkipStage1Change: (value: boolean) => void;
  onSkipStage2Change: (value: boolean) => void;
  disabled?: boolean;
}) {
  const runSummary =
    skipStage1 && skipStage2
      ? "Stage 3 only"
      : skipStage1
        ? "Stages 2 and 3"
        : skipStage2
          ? "Stages 1 and 3"
          : "All three stages";

  return (
    <motion.div
      initial={false}
      className="mx-auto w-full max-w-md space-y-2 text-left"
    >
      <div className="flex items-center justify-center gap-1.5 text-xs font-medium text-muted-foreground">
        <FastForward className="size-3.5" aria-hidden />
        <span>Skip stages</span>
      </div>
      <div className="space-y-2 rounded-lg border border-border/60 bg-muted/20 p-3">
        <SkipOption
          id="skip-stage-1"
          label="Skip Stage 1 · Fecal classification"
          hint="Start at helminth screening (Stage 2)."
          checked={skipStage1}
          disabled={disabled}
          onChange={onSkipStage1Change}
        />
        <SkipOption
          id="skip-stage-2"
          label="Skip Stage 2 · Helminth screening"
          hint={
            skipStage1
              ? "Jump straight to species detection (Stage 3)."
              : "Run Stage 1, then go directly to Stage 3."
          }
          checked={skipStage2}
          disabled={disabled}
          onChange={onSkipStage2Change}
        />
        <p className="border-t border-border/50 pt-2 text-[11px] leading-snug text-muted-foreground">
          Stage 3 always runs when the pipeline starts.{" "}
          <span className="font-medium text-foreground">{runSummary}</span> will
          run for this upload.
        </p>
      </div>
    </motion.div>
  );
}

function SkipOption({
  id,
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="group flex items-start gap-3 rounded-md px-1 py-1 transition-colors hover:bg-muted/30">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className={cn(
          "mt-0.5 size-4 shrink-0 cursor-pointer rounded border border-input accent-primary",
          "transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          "disabled:cursor-not-allowed disabled:opacity-50",
        )}
      />
      <Label
        htmlFor={id}
        className={cn(
          "cursor-pointer flex-col items-start gap-0.5 font-normal",
          disabled && "cursor-not-allowed opacity-50",
        )}
      >
        <span className="text-sm font-medium text-foreground">{label}</span>
        <span className="text-xs leading-snug text-muted-foreground">{hint}</span>
      </Label>
    </div>
  );
}
