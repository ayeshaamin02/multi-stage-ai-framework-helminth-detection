"use client";

import { cn } from "@/lib/utils";
import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

const hoverSpring = { type: "spring" as const, stiffness: 300, damping: 24 };

export function AnimatedCard({
  children,
  className,
  index = 0,
  direction = "up",
}: {
  children: ReactNode;
  className?: string;
  index?: number;
  direction?: "up" | "left" | "right";
}) {
  const reduceMotion = useReducedMotion();

  const initialVariant =
    direction === "left"
      ? { opacity: 0, x: -24 }
      : direction === "right"
        ? { opacity: 0, x: 24 }
        : { opacity: 0, y: 20 };
  const animateVariant =
    direction === "left" || direction === "right"
      ? { opacity: 1, x: 0 }
      : { opacity: 1, y: 0 };

  return (
    <motion.div
      className={cn("h-full", className)}
      initial={reduceMotion ? false : initialVariant}
      whileInView={reduceMotion ? undefined : animateVariant}
      viewport={{ once: true, margin: "-40px" }}
      transition={{
        type: "spring",
        stiffness: 80,
        damping: 18,
        delay: index * 0.06,
      }}
    >
      <motion.div
        className="h-full"
        whileHover={
          reduceMotion
            ? undefined
            : { y: -6, scale: 1.02, transition: hoverSpring }
        }
      >
        {children}
      </motion.div>
    </motion.div>
  );
}

export function StaggerGrid({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      className={className}
      initial={reduceMotion ? false : { opacity: 0 }}
      whileInView={reduceMotion ? undefined : { opacity: 1 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.4 }}
    >
      {children}
    </motion.div>
  );
}
