"use client";

import { DetectionImagePreview } from "@/components/dashboard/detection-image-preview";
import type { DetectionBoxItem } from "@/components/dashboard/detection-image-preview";
import { Skeleton } from "@/components/ui/skeleton";
import { useBrowserImagePreviewUrl } from "@/hooks/use-browser-image-preview-url";
import {
  readImageBoxCoordinateMeta,
  type ImageBoxCoordinateMeta,
} from "@/lib/read-image-box-meta";
import { cn } from "@/lib/utils";
import { ImageOff } from "lucide-react";
import { useEffect, useState } from "react";

type RunDetailImageProps = {
  src: string;
  alt: string;
  withOverlay?: false;
  tiffDecode?: boolean;
  filenameHint?: string | null;
} | {
  src: string;
  alt: string;
  withOverlay: true;
  items: DetectionBoxItem[];
  tiffDecode?: boolean;
  filenameHint?: string | null;
};

export function RunDetailImage(props: RunDetailImageProps) {
  const [loaded, setLoaded] = useState(false);
  const [boxCoordinateMeta, setBoxCoordinateMeta] =
    useState<ImageBoxCoordinateMeta | null>(null);
  const tiffDecode = props.tiffDecode ?? false;
  const filenameHint = props.filenameHint ?? null;

  const { displayUrl, loading, error, sourceWidth, sourceHeight } = useBrowserImagePreviewUrl(
    tiffDecode ? props.src : null,
    {
      enabled: tiffDecode,
      filename: filenameHint,
      credentials: "include",
    },
  );

  useEffect(() => {
    if (props.withOverlay !== true) {
      setBoxCoordinateMeta(null);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(props.src, { credentials: "include" });
        if (!res.ok) throw new Error(`Could not load image (${res.status}).`);
        const blob = await res.blob();
        const meta = await readImageBoxCoordinateMeta(blob);
        if (!cancelled) setBoxCoordinateMeta(meta);
      } catch {
        if (!cancelled) setBoxCoordinateMeta(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [props.withOverlay, props.src]);

  const boxSourceWidth =
    props.withOverlay === true ? (sourceWidth ?? undefined) : undefined;
  const boxSourceHeight =
    props.withOverlay === true ? (sourceHeight ?? undefined) : undefined;

  const imageSrc = tiffDecode ? displayUrl : props.src;
  const showSkeleton = (tiffDecode && loading) || (!loaded && imageSrc);

  if (tiffDecode && error) {
    return (
      <div
        className="flex min-h-[min(40vh,320px)] flex-col items-center justify-center gap-2 rounded-lg border border-border/60 bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground"
        role="status"
      >
        <ImageOff className="size-8 shrink-0 opacity-60" aria-hidden />
        <p>Could not preview this TIFF image in the browser.</p>
        <p className="text-xs">{error}</p>
      </div>
    );
  }

  if (tiffDecode && loading) {
    return (
      <div className="relative w-full min-h-[min(40vh,320px)]" role="status" aria-live="polite">
        <Skeleton className="absolute inset-0 z-0 h-full min-h-[min(40vh,320px)] w-full rounded-lg" />
        <p className="sr-only">Loading image preview…</p>
      </div>
    );
  }

  if (!imageSrc) {
    return (
      <Skeleton className="h-[min(40vh,320px)] w-full rounded-lg" aria-hidden />
    );
  }

  return (
    <div className="relative w-full min-h-[min(40vh,320px)]">
      {showSkeleton ? (
        <Skeleton className="absolute inset-0 z-0 h-full min-h-[min(40vh,320px)] w-full rounded-lg" />
      ) : null}
      {props.withOverlay ? (
        <div className={cn(!loaded && "opacity-0")}>
          <DetectionImagePreview
            objectUrl={imageSrc}
            items={props.items}
            boxSourceWidth={boxSourceWidth}
            boxSourceHeight={boxSourceHeight}
            boxCoordinateMeta={boxCoordinateMeta}
            onImageLoad={() => setLoaded(true)}
          />
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- authenticated or blob preview URL
        <img
          src={imageSrc}
          alt={props.alt}
          className={cn(
            "relative z-10 mx-auto block h-auto max-h-[min(70vh,560px)] w-full rounded-lg border border-border/60 object-contain",
            !loaded && "opacity-0",
          )}
          onLoad={() => setLoaded(true)}
        />
      )}
    </div>
  );
}
