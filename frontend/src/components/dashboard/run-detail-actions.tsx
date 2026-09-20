"use client";

import { Button } from "@/components/ui/button";
import { Copy, Download, Loader2 } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

type RunDetailActionsProps = {
  runId: string;
  originalFilename: string | null;
  hasAnnotatedImage: boolean;
  predictionApiDelegateToken: string | null;
};

export function RunDetailActions({
  runId,
  originalFilename,
  hasAnnotatedImage,
  predictionApiDelegateToken,
}: RunDetailActionsProps) {
  const [downloadBusy, setDownloadBusy] = useState(false);

  const delegateAuthHeaders = useMemo(
    () =>
      predictionApiDelegateToken
        ? { Authorization: `Bearer ${predictionApiDelegateToken}` }
        : undefined,
    [predictionApiDelegateToken],
  );

  const copyRunId = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(runId);
      toast.success("Run ID copied");
    } catch {
      toast.error("Could not copy", {
        description: "Your browser may block clipboard access on this page.",
      });
    }
  }, [runId]);

  const downloadAnnotatedPng = useCallback(async () => {
    if (!hasAnnotatedImage) return;
    setDownloadBusy(true);
    try {
      const res = await fetch(
        `/api/predictions/pipeline-run/${runId}/image/stage3-annotated`,
        { credentials: "include", headers: delegateAuthHeaders },
      );
      if (!res.ok) {
        toast.error("Download failed", {
          description: `Server returned ${res.status}.`,
        });
        return;
      }
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      const base = (originalFilename ?? "prediction").replace(/\.[^/.]+$/, "");
      const filename = `${base}-stage3-annotated.png`;
      a.download = filename;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
      toast.success("Download started", { description: filename });
    } catch {
      toast.error("Download failed", {
        description: "Network error while fetching the image.",
      });
    } finally {
      setDownloadBusy(false);
    }
  }, [delegateAuthHeaders, hasAnnotatedImage, originalFilename, runId]);

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5"
        onClick={() => void copyRunId()}
      >
        <Copy className="size-3.5" aria-hidden />
        Copy run ID
      </Button>
      {hasAnnotatedImage ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          disabled={downloadBusy}
          onClick={() => void downloadAnnotatedPng()}
        >
          {downloadBusy ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
          ) : (
            <Download className="size-3.5" aria-hidden />
          )}
          Annotated PNG
        </Button>
      ) : null}
    </div>
  );
}
