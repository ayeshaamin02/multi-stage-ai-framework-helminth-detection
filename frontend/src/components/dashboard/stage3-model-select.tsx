"use client";

import {
  DEFAULT_STAGE3_MODEL_FILENAME,
  STAGE3_MODEL_OPTIONS,
} from "@/lib/helminth-config";
import { cn } from "@/lib/utils";
import { ScanSearch } from "lucide-react";

const selectClass =
  "h-10 w-full min-w-0 cursor-pointer rounded-md border border-input bg-background px-3 text-sm shadow-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50";

export type Stage3ModelSelectProps = {
  value: string;
  onChange: (filename: string) => void;
  disabled?: boolean;
  className?: string;
};

export function Stage3ModelSelect({
  value,
  onChange,
  disabled = false,
  className,
}: Stage3ModelSelectProps) {
  const effective =
    STAGE3_MODEL_OPTIONS.some((o) => o.filename === value)
      ? value
      : DEFAULT_STAGE3_MODEL_FILENAME;

  return (
    <div
      className={cn(
        "rounded-xl border border-border/60 bg-muted/15 p-3.5",
        className,
      )}
    >
      <div className="flex items-start gap-2">
        <ScanSearch
          className="mt-0.5 size-4 shrink-0 text-primary"
          aria-hidden
        />
        <div className="min-w-0 flex-1 space-y-2">
          <div>
            <p className="text-sm font-medium text-foreground">
              Stage 3 detector
            </p>
            <p className="text-xs leading-snug text-muted-foreground">
              Species localization runs one architecture per upload. Default is
              YOLO; choose RT-DETR for an alternative detector.
            </p>
          </div>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            <span>Detection model</span>
            <select
              className={selectClass}
              value={effective}
              disabled={disabled}
              onChange={(e) => onChange(e.target.value)}
              aria-label="Stage 3 detection model"
            >
              {STAGE3_MODEL_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.filename}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
    </div>
  );
}
