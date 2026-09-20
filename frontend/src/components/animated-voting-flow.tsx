"use client";

import { cn } from "@/lib/utils";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Check, Vote, X } from "lucide-react";

const MODELS = [
  "VGG19",
  "ResNet50",
  "DenseNet169",
  "EfficientNetB0",
  "MobileNetV2",
  "NASNetMobile",
  "ConvNeXtBase",
] as const;

const hoverSpring = { type: "spring" as const, stiffness: 300, damping: 24 };

export function AnimatedVotingFlow({ className }: { className?: string }) {
  const reduceMotion = useReducedMotion();

  return (
    <div className={cn("flex flex-col items-center gap-8", className)}>
      {/* Model grid */}
      <div className="grid w-full grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {MODELS.map((name, i) => (
          <motion.div
            key={name}
            className="group relative"
            initial={reduceMotion ? false : { opacity: 0, scale: 0.8, y: 16 }}
            whileInView={reduceMotion ? undefined : { opacity: 1, scale: 1, y: 0 }}
            viewport={{ once: true, margin: "-30px" }}
            transition={{
              type: "spring",
              stiffness: 100,
              damping: 16,
              delay: 0.06 * i,
            }}
          >
            <motion.div
              className="flex flex-col items-center gap-2 rounded-xl border border-border/80 bg-background px-3 py-4 text-center shadow-sm transition-shadow duration-200"
              whileHover={
                reduceMotion
                  ? undefined
                  : { y: -4, scale: 1.04, transition: hoverSpring }
              }
              data-cursor-hover
            >
              <span
                className={cn(
                  "flex size-8 items-center justify-center rounded-full text-[10px] font-bold text-white",
                  i < 4
                    ? "bg-emerald-600 dark:bg-emerald-500"
                    : "bg-emerald-600 dark:bg-emerald-500"
                )}
              >
                {i < 5 ? (
                  <Check className="size-3.5" aria-hidden />
                ) : (
                  <X className="size-3.5" aria-hidden />
                )}
              </span>
              <span className="text-xs font-semibold text-foreground">{name}</span>
              <span className="text-[10px] text-muted-foreground">
                {i < 5 ? "Fecal" : "Non fecal"}
              </span>
            </motion.div>
          </motion.div>
        ))}
      </div>

      {/* Connector arrow */}
      <motion.div
        className="flex flex-col items-center gap-1"
        initial={reduceMotion ? false : { opacity: 0, scaleY: 0 }}
        whileInView={reduceMotion ? undefined : { opacity: 1, scaleY: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.4, delay: 0.5 }}
        style={{ transformOrigin: "top" }}
      >
        <div className="h-8 w-px bg-gradient-to-b from-border to-primary/60" />
        <ArrowRight className="size-4 rotate-90 text-primary/60" aria-hidden />
      </motion.div>

      {/* Vote result */}
      <motion.div
        className="w-full max-w-sm"
        initial={reduceMotion ? false : { opacity: 0, y: 16, scale: 0.95 }}
        whileInView={reduceMotion ? undefined : { opacity: 1, y: 0, scale: 1 }}
        viewport={{ once: true }}
        transition={{ type: "spring", stiffness: 80, damping: 18, delay: 0.65 }}
      >
        <motion.div
          className="flex items-center justify-center gap-3 rounded-2xl border-2 border-primary/30 bg-primary/5 px-6 py-5 shadow-lg shadow-primary/5"
          whileHover={
            reduceMotion
              ? undefined
              : { scale: 1.03, transition: hoverSpring }
          }
          data-cursor-hover
        >
          <div className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Vote className="size-5" aria-hidden />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Majority vote: Fecal</p>
            <p className="text-xs text-muted-foreground">5 of 7 models agree &middot; Advance to Phase 2</p>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}
