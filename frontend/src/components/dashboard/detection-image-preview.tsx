"use client";

import type { ImageBoxCoordinateMeta } from "@/lib/read-image-box-meta";
import { mapBoxToObjectFitContain } from "@/lib/detection-box-layout";
import { getDetectionPaletteEntryForClass } from "@/lib/detection-palette";
import { cn } from "@/lib/utils";
import { useCallback, useLayoutEffect, useRef, useState } from "react";

export type DetectionBoxItem = {
  id: string;
  /** 1-based key shown on the image and in the legend (Box 1, Box 2, …). */
  legendKey: string;
  /** When set, box color is stable for this species/class. */
  classId?: number;
  modelFilename: string;
  className: string;
  confidence: number;
  box: [number, number, number, number];
};

type DetectionImagePreviewProps = {
  objectUrl: string | null;
  items: DetectionBoxItem[];
  className?: string;
  /** Full-resolution width when preview pixels differ from model coordinates (e.g. TIFF). */
  boxSourceWidth?: number;
  boxSourceHeight?: number;
  /** EXIF metadata from the same bytes the model received. */
  boxCoordinateMeta?: ImageBoxCoordinateMeta | null;
  /** Fires after the backing image has loaded and layout is measured. */
  onImageLoad?: () => void;
};

export function DetectionImagePreview({
  objectUrl,
  items,
  className,
  boxSourceWidth,
  boxSourceHeight,
  boxCoordinateMeta,
  onImageLoad,
}: DetectionImagePreviewProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [layout, setLayout] = useState({ w: 0, h: 0, nw: 1, nh: 1 });

  const measure = useCallback(() => {
    const img = imgRef.current;
    if (!img?.naturalWidth) return;
    setLayout({
      w: img.getBoundingClientRect().width,
      h: img.getBoundingClientRect().height,
      nw: img.naturalWidth,
      nh: img.naturalHeight,
    });
  }, []);

  useLayoutEffect(() => {
    measure();
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure, objectUrl]);

  if (!objectUrl) return null;

  const containLayout = {
    containerWidth: layout.w,
    containerHeight: layout.h,
    imageWidth: layout.nw,
    imageHeight: layout.nh,
    boxSourceWidth,
    boxSourceHeight,
    exifOrientation: boxCoordinateMeta?.orientation,
    rawWidth: boxCoordinateMeta?.rawWidth,
    rawHeight: boxCoordinateMeta?.rawHeight,
  };

  return (
    <div
      ref={wrapRef}
      className={cn(
        "relative w-full overflow-hidden rounded-lg border border-border/60 bg-muted/20",
        className,
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- local object URL from user upload */}
      <img
        ref={imgRef}
        src={objectUrl}
        alt="Uploaded microscopy slide"
        className="block h-auto max-h-[min(70vh,560px)] w-full object-contain"
        onLoad={() => {
          measure();
          onImageLoad?.();
        }}
      />
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        {items.map((d) => {
          const { left, top, width, height } = mapBoxToObjectFitContain(
            d.box,
            containLayout,
          );
          const colors = getDetectionPaletteEntryForClass(d.classId, d.className);
          return (
            <div
              key={d.id}
              className="absolute box-border shadow-sm"
              style={{
                left,
                top,
                width,
                height,
                borderWidth: 2,
                borderStyle: "solid",
                borderColor: colors.border,
                backgroundColor: `${colors.border}14`,
              }}
            >
              <span
                className="absolute left-0 top-0 z-10 min-h-[1.125rem] min-w-[1.125rem] rounded-br px-1 font-mono text-[10px] font-bold leading-none text-white"
                style={{ backgroundColor: colors.badge }}
              >
                {d.legendKey}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
