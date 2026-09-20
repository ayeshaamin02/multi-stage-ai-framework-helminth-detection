"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { useBrowserImagePreviewUrl } from "@/hooks/use-browser-image-preview-url";
import { isTiffSource } from "@/lib/tiff-preview";
import { cn } from "@/lib/utils";
import { ImageOff } from "lucide-react";
import Image from "next/image";

type HistoryThumbnailProps = {
  src: string;
  alt: string;
  filename?: string | null;
  /** When true, skip TIFF decode (e.g. stage3-annotated PNG route). */
  isAnnotatedPng?: boolean;
};

export function HistoryThumbnail({
  src,
  alt,
  filename,
  isAnnotatedPng = false,
}: HistoryThumbnailProps) {
  const needsTiffDecode =
    !isAnnotatedPng && isTiffSource({ name: filename ?? undefined });

  const { displayUrl, loading, error } = useBrowserImagePreviewUrl(
    needsTiffDecode ? src : null,
    {
      enabled: needsTiffDecode,
      filename,
      credentials: "include",
    },
  );

  if (!needsTiffDecode) {
    return (
      <Image
        src={src}
        alt={alt}
        width={80}
        height={80}
        className="size-20 rounded-lg border border-border/70 object-cover"
        loading="lazy"
        unoptimized
      />
    );
  }

  if (loading) {
    return (
      <Skeleton
        className="size-20 rounded-lg border border-border/70"
        aria-label="Loading thumbnail"
      />
    );
  }

  if (error || !displayUrl) {
    return (
      <div
        className="flex size-20 items-center justify-center rounded-lg border border-border/70 bg-muted/30 text-muted-foreground"
        title={error ?? "Preview unavailable"}
        aria-label="Thumbnail unavailable"
      >
        <ImageOff className="size-5" aria-hidden />
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- decoded TIFF blob URL
    <img
      src={displayUrl}
      alt={alt}
      width={80}
      height={80}
      loading="lazy"
      className={cn(
        "size-20 rounded-lg border border-border/70 object-cover",
      )}
    />
  );
}
