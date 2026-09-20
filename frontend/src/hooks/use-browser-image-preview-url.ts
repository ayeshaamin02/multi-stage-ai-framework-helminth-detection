"use client";

import { useEffect, useState } from "react";
import {
  isTiffSource,
  previewUrlFromFetchedBlob,
  revokePreviewUrl,
} from "@/lib/tiff-preview";

export type UseBrowserImagePreviewUrlOptions = {
  enabled?: boolean;
  filename?: string | null;
  contentType?: string | null;
  credentials?: RequestCredentials;
};

export function useBrowserImagePreviewUrl(
  src: string | null,
  options: UseBrowserImagePreviewUrlOptions = {},
): {
  displayUrl: string | null;
  loading: boolean;
  error: string | null;
  sourceWidth: number | null;
  sourceHeight: number | null;
} {
  const {
    enabled = true,
    filename = null,
    contentType = null,
    credentials = "include",
  } = options;

  const mightBeTiff =
    Boolean(src && enabled) &&
    (isTiffSource({ name: filename, type: contentType }) ||
      (!filename &&
        !contentType &&
        Boolean(src && /\.tiff?(?:$|\?)/i.test(src))));

  const [displayUrl, setDisplayUrl] = useState<string | null>(
    mightBeTiff ? null : src,
  );
  const [loading, setLoading] = useState(mightBeTiff);
  const [error, setError] = useState<string | null>(null);
  const [sourceWidth, setSourceWidth] = useState<number | null>(null);
  const [sourceHeight, setSourceHeight] = useState<number | null>(null);

  useEffect(() => {
    if (!src || !enabled) {
      setDisplayUrl(src);
      setLoading(false);
      setError(null);
      setSourceWidth(null);
      setSourceHeight(null);
      return;
    }

    const needsDecode =
      isTiffSource({ name: filename, type: contentType }) ||
      (!filename && !contentType && /\.tiff?(?:$|\?)/i.test(src));

    if (!needsDecode) {
      setDisplayUrl(src);
      setLoading(false);
      setError(null);
      setSourceWidth(null);
      setSourceHeight(null);
      return;
    }

    let cancelled = false;
    let createdUrl: string | null = null;
    setLoading(true);
    setError(null);
    setDisplayUrl(null);
    setSourceWidth(null);
    setSourceHeight(null);

    void (async () => {
      try {
        const res = await fetch(src, { credentials });
        if (!res.ok) {
          throw new Error(`Could not load image (${res.status}).`);
        }
        const blob = await res.blob();
        const resolvedType = contentType ?? blob.type ?? null;
        const preview = await previewUrlFromFetchedBlob(blob, {
          name: filename,
          type: resolvedType,
        });
        if (cancelled) {
          revokePreviewUrl(preview.url);
          return;
        }
        createdUrl = preview.url;
        setDisplayUrl(preview.url);
        setSourceWidth(preview.sourceWidth ?? null);
        setSourceHeight(preview.sourceHeight ?? null);
        setLoading(false);
      } catch (reason) {
        if (cancelled) return;
        const message =
          reason instanceof Error
            ? reason.message
            : "Could not preview this TIFF image.";
        setError(message);
        setDisplayUrl(null);
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      revokePreviewUrl(createdUrl);
    };
  }, [src, enabled, filename, contentType, credentials]);

  return { displayUrl, loading, error, sourceWidth, sourceHeight };
}
