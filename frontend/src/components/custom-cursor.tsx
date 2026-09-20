"use client";

import { motion, useMotionValue, useSpring } from "framer-motion";
import { useEffect, useState } from "react";

const spring = { stiffness: 420, damping: 28, mass: 0.35 };

export function CustomCursor() {
  const [enabled, setEnabled] = useState(false);
  const [hovering, setHovering] = useState(false);
  const x = useMotionValue(-100);
  const y = useMotionValue(-100);
  const sx = useSpring(x, spring);
  const sy = useSpring(y, spring);

  useEffect(() => {
    const mqFine = window.matchMedia("(pointer: fine)");
    const mqReduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setEnabled(mqFine.matches && !mqReduce.matches);
    update();
    mqFine.addEventListener("change", update);
    mqReduce.addEventListener("change", update);
    return () => {
      mqFine.removeEventListener("change", update);
      mqReduce.removeEventListener("change", update);
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const onMove = (e: MouseEvent) => {
      x.set(e.clientX);
      y.set(e.clientY);
      const el = document.elementFromPoint(e.clientX, e.clientY);
      setHovering(!!(el && el.closest("[data-cursor-hover]")));
    };

    window.addEventListener("mousemove", onMove, { passive: true });

    return () => {
      window.removeEventListener("mousemove", onMove);
    };
  }, [enabled, x, y]);

  useEffect(() => {
    if (!enabled) return;
    document.documentElement.dataset.customCursor = "on";
    return () => {
      delete document.documentElement.dataset.customCursor;
    };
  }, [enabled]);

  if (!enabled) return null;

  return (
    <motion.div
      className="pointer-events-none fixed left-0 top-0 z-[100]"
      aria-hidden
      style={{ x: sx, y: sy }}
    >
      <div className="-translate-x-1/2 -translate-y-1/2">
        <motion.div
          className="rounded-full border-2 border-primary bg-background shadow-sm ring-1 ring-primary/15"
          animate={{
            width: hovering ? 40 : 10,
            height: hovering ? 40 : 10,
            opacity: hovering ? 0.92 : 1,
          }}
          transition={{ type: "spring", stiffness: 400, damping: 28 }}
        />
      </div>
    </motion.div>
  );
}
