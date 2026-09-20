"use client";

import {
  layoutWithLines,
  prepareWithSegments,
  type PreparedTextWithSegments,
} from "@chenglou/pretext";
import { motion, useReducedMotion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";

const CTA_TEXT =
  "Bring clinical clarity to every microscopic slide.";

function fontForWidth(w: number): {
  font: string;
  lineHeightPx: number;
  fontSizePx: number;
} {
  const fontSizePx = w < 400 ? 22 : w < 640 ? 26 : w < 900 ? 32 : 38;
  const lineHeightPx = Math.round(fontSizePx * 1.2);
  return {
    font: `600 ${fontSizePx}px Inter, sans-serif`,
    lineHeightPx,
    fontSizePx,
  };
}

export function PretextCtaBlock() {
  const reduceMotion = useReducedMotion();
  const wrapRef = useRef<HTMLDivElement>(null);
  const preparedRef = useRef<PreparedTextWithSegments | null>(null);
  const metaRef = useRef<{ lineHeightPx: number; fontSizePx: number } | null>(
    null
  );
  const [lines, setLines] = useState<string[]>([]);
  const [sizes, setSizes] = useState<{
    fontSizePx: number;
    lineHeightPx: number;
  } | null>(null);

  const applyLayout = useCallback((containerWidth: number) => {
    const p = preparedRef.current;
    const m = metaRef.current;
    if (!p || !m || containerWidth < 80) return;
    const { lines: ls } = layoutWithLines(p, containerWidth, m.lineHeightPx);
    setLines(ls.map((l) => l.text));
  }, []);

  const relayout = useCallback(async () => {
    const el = wrapRef.current;
    if (!el || reduceMotion) return;
    try {
      await document.fonts.ready;
    } catch {
      /* ignore */
    }
    const width = Math.floor(el.getBoundingClientRect().width);
    if (width < 80) return;
    const { font, lineHeightPx, fontSizePx } = fontForWidth(width);
    try {
      preparedRef.current = prepareWithSegments(CTA_TEXT, font);
      metaRef.current = { lineHeightPx, fontSizePx };
      setSizes({ fontSizePx, lineHeightPx });
      applyLayout(width);
    } catch {
      /* ignore */
    }
  }, [applyLayout, reduceMotion]);

  useEffect(() => {
    if (reduceMotion) return;
    void relayout();
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => relayout());
    ro.observe(el);
    return () => ro.disconnect();
  }, [relayout, reduceMotion]);

  if (reduceMotion) {
    return (
      <p
        id="cta-pretext"
        className="max-w-3xl text-2xl font-semibold tracking-tight text-foreground sm:text-3xl"
      >
        {CTA_TEXT}
      </p>
    );
  }

  return (
    <div ref={wrapRef} className="w-full max-w-3xl">
      {lines.length > 0 && sizes ? (
        <p
          id="cta-pretext"
          className="m-0 font-semibold tracking-tight text-foreground"
          style={{
            fontSize: sizes.fontSizePx,
            lineHeight: `${sizes.lineHeightPx}px`,
          }}
        >
          {lines.map((line, i) => (
            <motion.span
              key={`${i}-${line}`}
              className="group/line block cursor-default"
              data-cursor-hover
              initial={{ opacity: 0, x: -12, filter: "blur(6px)" }}
              whileInView={{ opacity: 1, x: 0, filter: "blur(0px)" }}
              viewport={{ once: true, margin: "-20% 0px" }}
              transition={{
                duration: 0.55,
                delay: 0.1 * i,
                ease: [0.22, 1, 0.36, 1],
              }}
              whileHover={{
                x: 6,
                transition: { type: "spring", stiffness: 380, damping: 22 },
              }}
            >
              <span className="pretext-underline-inner group-hover/line:bg-[length:100%_2px]">
                {line}
              </span>
            </motion.span>
          ))}
        </p>
      ) : (
        <p className="text-2xl font-semibold text-transparent sm:text-3xl">
          {CTA_TEXT}
        </p>
      )}
    </div>
  );
}
