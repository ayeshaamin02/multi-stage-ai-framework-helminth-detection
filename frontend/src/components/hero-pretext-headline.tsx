"use client";

import {
  layoutWithLines,
  prepareWithSegments,
  type PreparedTextWithSegments,
} from "@chenglou/pretext";
import { motion, useReducedMotion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";

const HEADLINE =
  "AI-powered fecal screening for every microscopic slide.";

function fontSpecForWidth(containerWidth: number): {
  font: string;
  lineHeightPx: number;
  fontSizePx: number;
} {
  const fontSizePx =
    containerWidth < 480 ? 32 : containerWidth < 768 ? 40 : containerWidth < 1024 ? 48 : 56;
  const lineHeightPx = Math.round(fontSizePx * 1.12);
  return {
    font: `600 ${fontSizePx}px Inter, sans-serif`,
    lineHeightPx,
    fontSizePx,
  };
}

export function HeroPretextHeadline() {
  const reduceMotion = useReducedMotion();
  const containerRef = useRef<HTMLDivElement>(null);
  const preparedRef = useRef<PreparedTextWithSegments | null>(null);
  const metaRef = useRef<{
    lineHeightPx: number;
    fontSizePx: number;
    containerWidth: number;
  } | null>(null);
  const pointerNxRef = useRef(0.5);
  const rafRef = useRef<number | null>(null);

  const [layout, setLayout] = useState<{
    lines: string[];
    lineHeightPx: number;
    fontSizePx: number;
  } | null>(null);

  const applyLayoutWidth = useCallback((maxWidth: number) => {
    const prepared = preparedRef.current;
    const meta = metaRef.current;
    if (!prepared || !meta) return;
    const w = Math.max(
      120,
      Math.min(Math.floor(maxWidth), meta.containerWidth)
    );
    try {
      const { lines: lineObjs } = layoutWithLines(
        prepared,
        w,
        meta.lineHeightPx
      );
      setLayout({
        lines: lineObjs.map((l) => l.text),
        lineHeightPx: meta.lineHeightPx,
        fontSizePx: meta.fontSizePx,
      });
    } catch {
      /* ignore */
    }
  }, []);

  const flushPointerLayout = useCallback(() => {
    rafRef.current = null;
    const meta = metaRef.current;
    if (!meta) return;
    const nx = pointerNxRef.current;
    const bias = 0.86 + 0.28 * nx;
    const w = Math.floor(meta.containerWidth * Math.min(bias, 1));
    applyLayoutWidth(w);
  }, [applyLayoutWidth]);

  const relayout = useCallback(() => {
    const el = containerRef.current;
    if (!el || reduceMotion) return;

    const width = Math.floor(el.getBoundingClientRect().width);
    if (width < 16) return;

    const { font, lineHeightPx, fontSizePx } = fontSpecForWidth(width);
    let prepared: PreparedTextWithSegments;
    try {
      prepared = prepareWithSegments(HEADLINE, font);
    } catch {
      return;
    }
    preparedRef.current = prepared;
    metaRef.current = {
      lineHeightPx,
      fontSizePx,
      containerWidth: width,
    };
    pointerNxRef.current = 0.5;
    applyLayoutWidth(width);
  }, [applyLayoutWidth, reduceMotion]);

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
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [relayout, reduceMotion]);

  const onMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (reduceMotion || !preparedRef.current || !metaRef.current) return;
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width;
    pointerNxRef.current = Math.max(0, Math.min(1, nx));
    if (rafRef.current == null) {
      rafRef.current = requestAnimationFrame(flushPointerLayout);
    }
  };

  const onMouseLeave = () => {
    pointerNxRef.current = 0.5;
    const meta = metaRef.current;
    if (meta) {
      applyLayoutWidth(meta.containerWidth);
    }
  };

  if (reduceMotion) {
    return (
      <h1
        id="hero-heading"
        className="group/pretext-line max-w-4xl cursor-default text-4xl font-semibold tracking-tight text-foreground sm:text-5xl lg:text-6xl"
      >
        <span className="pretext-underline-inner group-hover/pretext-line:bg-[length:100%_2px]">
          {HEADLINE}
        </span>
      </h1>
    );
  }

  return (
    <div
      ref={containerRef}
      className="group/pretext-line w-full max-w-4xl cursor-default"
      aria-busy={!layout}
      data-cursor-hover
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
    >
      {layout ? (
        <h1
          id="hero-heading"
          className="m-0 font-semibold tracking-tight text-foreground transition-[opacity] duration-300"
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
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.45,
                  delay: 0.06 * i,
                  ease: [0.22, 1, 0.36, 1],
                }}
              >
                <span className="pretext-underline-inner group-hover/pretext-line:bg-[length:100%_2px]">
                  {line}
                </span>
              </motion.span>
            </span>
          ))}
        </h1>
      ) : (
        <h1
          id="hero-heading"
          className="m-0 max-w-4xl text-4xl font-semibold tracking-tight text-foreground/80 sm:text-5xl lg:text-6xl"
        >
          <span className="pretext-underline-inner group-hover/pretext-line:bg-[length:100%_2px]">
            {HEADLINE}
          </span>
        </h1>
      )}
    </div>
  );
}
