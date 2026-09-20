"use client";

import {
  layoutWithLines,
  prepareWithSegments,
  type PreparedTextWithSegments,
} from "@chenglou/pretext";
import { motion, useReducedMotion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";

function fontSpecForWidth(containerWidth: number): {
  font: string;
  lineHeightPx: number;
  fontSizePx: number;
} {
  const fontSizePx =
    containerWidth < 400 ? 28 : containerWidth < 640 ? 32 : containerWidth < 900 ? 36 : 42;
  const lineHeightPx = Math.round(fontSizePx * 1.15);
  return {
    font: `600 ${fontSizePx}px Inter, sans-serif`,
    lineHeightPx,
    fontSizePx,
  };
}

export function PretextPageHeadline({ text, id }: { text: string; id?: string }) {
  const reduceMotion = useReducedMotion();
  const containerRef = useRef<HTMLDivElement>(null);
  const preparedRef = useRef<PreparedTextWithSegments | null>(null);
  const metaRef = useRef<{
    lineHeightPx: number;
    fontSizePx: number;
    containerWidth: number;
  } | null>(null);

  const [layout, setLayout] = useState<{
    lines: string[];
    lineHeightPx: number;
    fontSizePx: number;
  } | null>(null);

  const applyLayout = useCallback((maxWidth: number) => {
    const prepared = preparedRef.current;
    const meta = metaRef.current;
    if (!prepared || !meta) return;
    const w = Math.max(120, Math.min(Math.floor(maxWidth), meta.containerWidth));
    try {
      const { lines: lineObjs } = layoutWithLines(prepared, w, meta.lineHeightPx);
      setLayout({
        lines: lineObjs.map((l) => l.text),
        lineHeightPx: meta.lineHeightPx,
        fontSizePx: meta.fontSizePx,
      });
    } catch {
      /* ignore */
    }
  }, []);

  const relayout = useCallback(() => {
    const el = containerRef.current;
    if (!el || reduceMotion) return;
    const width = Math.floor(el.getBoundingClientRect().width);
    if (width < 16) return;
    const { font, lineHeightPx, fontSizePx } = fontSpecForWidth(width);
    try {
      preparedRef.current = prepareWithSegments(text, font);
    } catch {
      return;
    }
    metaRef.current = { lineHeightPx, fontSizePx, containerWidth: width };
    applyLayout(width);
  }, [applyLayout, reduceMotion, text]);

  useEffect(() => {
    if (reduceMotion) return;
    let ro: ResizeObserver | null = null;
    let cancelled = false;

    void (async () => {
      try {
        await document.fonts.ready;
      } catch {
        /* ignore */
      }
      if (cancelled) return;
      relayout();
      const el = containerRef.current;
      if (!el || typeof ResizeObserver === "undefined") return;
      ro = new ResizeObserver(() => relayout());
      ro.observe(el);
    })();

    return () => {
      cancelled = true;
      ro?.disconnect();
    };
  }, [relayout, reduceMotion]);

  if (reduceMotion) {
    return (
      <h1
        id={id}
        className="max-w-3xl text-3xl font-semibold tracking-tight text-foreground sm:text-4xl"
      >
        {text}
      </h1>
    );
  }

  return (
    <div ref={containerRef} className="w-full max-w-3xl" aria-busy={!layout}>
      {layout ? (
        <h1
          id={id}
          className="m-0 font-semibold tracking-tight text-foreground"
          style={{
            fontSize: layout.fontSizePx,
            lineHeight: `${layout.lineHeightPx}px`,
          }}
        >
          {layout.lines.map((line, i) => (
            <span key={`${i}-${line}`} className="block overflow-hidden">
              <motion.span
                className="block"
                initial={{ opacity: 0, y: "100%" }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-10% 0px" }}
                transition={{
                  duration: 0.5,
                  delay: 0.08 * i,
                  ease: [0.22, 1, 0.36, 1],
                }}
              >
                {line}
              </motion.span>
            </span>
          ))}
        </h1>
      ) : (
        <h1
          id={id}
          className="m-0 max-w-3xl text-3xl font-semibold tracking-tight text-foreground/80 sm:text-4xl"
        >
          {text}
        </h1>
      )}
    </div>
  );
}
