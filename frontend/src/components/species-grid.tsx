"use client";

import { HELMINTH_SPECIES } from "@/lib/pipeline-data";
import { cn } from "@/lib/utils";
import { motion, useReducedMotion } from "framer-motion";
import { Bug } from "lucide-react";

export function SpeciesGrid({
  showNotes = false,
  className,
}: {
  showNotes?: boolean;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <div className={cn("grid gap-3 sm:grid-cols-2 lg:grid-cols-3", className)}>
      {HELMINTH_SPECIES.map((sp, i) => (
        <motion.div
          key={sp.id}
          className={cn(
            "group flex items-start gap-3 rounded-xl border border-border/70 bg-background/80 px-4 py-3 transition-shadow duration-200 hover:shadow-md",
          )}
          initial={reduceMotion ? false : { opacity: 0, y: 12 }}
          whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-30px" }}
          transition={{
            duration: 0.35,
            delay: i * 0.03,
            ease: [0.22, 1, 0.36, 1],
          }}
        >
          <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
            <Bug className="size-3.5" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium italic text-foreground">
              {sp.name}
            </p>
            {showNotes && (
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                {sp.note}
              </p>
            )}
          </div>
        </motion.div>
      ))}
    </div>
  );
}
