"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Info } from "lucide-react";

const easeOut = [0.22, 1, 0.36, 1] as const;

/**
 * Calm, persistent reminder shown beneath the upload area while a prediction is
 * in progress or after it has completed. Not an alert (would be too loud on
 * every render); marked as `role="note"` for assistive tech.
 */
export function PredictionDisclaimer() {
  const reduceMotion = useReducedMotion();

  const Wrapper = reduceMotion ? "div" : motion.div;
  const wrapperMotion = reduceMotion
    ? {}
    : {
        initial: { opacity: 0, y: 4 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.2, ease: easeOut },
      };

  return (
    <Wrapper {...wrapperMotion}>
      <div
        role="note"
        className="flex items-start gap-2.5 rounded-xl border border-primary/25 bg-primary/5 px-3.5 py-2.5 text-sm leading-snug text-foreground shadow-sm"
      >
        <Info
          className="mt-0.5 size-4 shrink-0 text-primary"
          aria-hidden
        />
        <p>
          <span className="font-medium">
            Microscopy detection models are prone to errors.
          </span>{" "}
          Refer to a microbiologist for clinical decisions.
        </p>
      </div>
    </Wrapper>
  );
}
