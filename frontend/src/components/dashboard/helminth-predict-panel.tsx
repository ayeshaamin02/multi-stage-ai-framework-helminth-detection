"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { PipelineStepper } from "@/components/pipeline-stepper";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  DEFAULT_STAGE3_MODEL_FILENAME,
  STAGE1_MODEL_FILENAMES,
  STAGE2_MODEL_FILENAMES,
  STAGE3_MODEL_FILENAMES,
  getStage1GradcamWsUrl,
  getStage1LimeWsUrl,
  getStage1WsOriginForClient,
  getStage2GradcamWsUrl,
  getStage2LimeWsUrl,
  getStage2WsOriginForClient,
  getStage3LimeWsUrl,
  getStage3ModelLabel,
  getStage3WsOriginForClient,
  STAGE3_LIME_UI_ENABLED,
} from "@/lib/helminth-config";
import { extractGradcamPayload, extractLimePayload } from "@/lib/explanation-ws";
import {
  StageGradcamGrid,
  type GradcamModelEntry,
} from "@/components/dashboard/stage-gradcam-grid";
import {
  StageLimeCard,
  type LimeRunEntry,
} from "@/components/dashboard/stage-lime-card";
import {
  PipelineOutcomeBanner,
  type PipelineOutcome,
} from "@/components/dashboard/pipeline-outcome-banner";
import { Stage3ModelSelect } from "@/components/dashboard/stage3-model-select";
import {
  ForceFreshPredictionToggle,
  GenerateExplanationsCard,
  PipelineCacheHitBanner,
} from "@/components/dashboard/pipeline-cache-ui";
import { PipelineStageSkipControls } from "@/components/dashboard/pipeline-stage-skip-controls";
import {
  UnfinishedRunsBanner,
  UnfinishedRunsSheet,
} from "@/components/dashboard/unfinished-runs-sheet";
import type { UnfinishedRunItem } from "@/lib/unfinished-run-meta";
import { computeImageHashSha256 } from "@/lib/image-hash";
import { DetectionImagePreview } from "@/components/dashboard/detection-image-preview";
import { getDetectionPaletteEntryForClass } from "@/lib/detection-palette";
import { readImageBoxCoordinateMetaFromFile, type ImageBoxCoordinateMeta } from "@/lib/read-image-box-meta";
import { buildDetectionOverlayItemsFromResults } from "@/lib/stage3-detection-overlay";
import { resolvePipelineTerminalOutcome } from "@/lib/pipeline-terminal-outcome";
import { extractPreviewResultsFromStoredRun } from "@/lib/pipeline-result-payload";
import {
  previewUrlFromFile,
  revokePreviewUrl,
} from "@/lib/tiff-preview";
import { Skeleton } from "@/components/ui/skeleton";
import type { DetectionBoxItem } from "@/components/dashboard/detection-image-preview";
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  Loader2,
  Radio,
  Upload,
} from "lucide-react";

type StepStatus = "idle" | "active" | "complete" | "skipped";
type StageNumber = 1 | 2 | 3;

type PipelineStatusPayload = {
  ok: true;
  runStatus: "processing" | "finished" | "failed" | "timed_out";
  stage: StageNumber | null;
  persisted: boolean;
  remote?: Record<string, unknown>;
  gateDecision?: "fecal" | "non_fecal";
  awaitingStage2Start?: boolean;
  awaitingStage3Start?: boolean;
  idempotent?: boolean;
  finalOutcome?: string | null;
  stage1Status?: PipelineSubmitResponse["stage1Status"];
  stage2Status?: PipelineSubmitResponse["stage2Status"];
  stage3Status?: PipelineSubmitResponse["stage3Status"];
  skipStage1Requested?: boolean;
  skipStage2Requested?: boolean;
};

type PipelineSubmitResponse = {
  id: string;
  cached?: boolean;
  cacheSourceCreatedAt?: string | null;
  finalOutcome?: string | null;
  stage1Status?: StepStatus | "finished" | "skipped" | "failed" | "pending" | "processing";
  stage2Status?: StepStatus | "finished" | "skipped" | "failed" | "pending" | "processing";
  stage3Status?: StepStatus | "finished" | "skipped" | "failed" | "pending" | "processing";
  stage1VoteSummary?: StageVoteSummary | null;
  stage2VoteSummary?: StageVoteSummary | null;
  stage1ResultPayload?: { results?: unknown[] } | null;
  stage2ResultPayload?: { results?: unknown[] } | null;
  stage3ResultPayload?: { results?: unknown[] } | null;
  hasStage3AnnotatedImage?: boolean;
  stage?: {
    stage: StageNumber;
    externalJobId: string;
    totalModels: number;
  };
};

type UnfinishedRunsResponse = {
  ok: true;
  runs: UnfinishedRunItem[];
  count: number;
  limit: number;
  canStartNew: boolean;
};

type PipelineResumeResponse = {
  ok: true;
  id: string;
  resumeKind: "websocket" | "sync";
  stage: StageNumber | null;
  externalJobId?: string;
  totalModels?: number;
  sync?: PipelineStatusPayload;
};

type WsPayload = {
  type?: string;
  job_id?: string;
  status?: string;
  total_models?: number;
  completed_models?: number;
  results?: unknown[];
  errors?: unknown[];
  data?: {
    modelFilename?: string;
    classification?: {
      predicted_class?: number;
      max_prob?: number;
      probability?: number;
      class_probabilities?: Record<string, number>;
    };
    prediction?: {
      predictions?: Array<{
        class_id?: number;
        class_name?: string;
        confidence?: number;
        box?: number[];
      }>;
    };
    index?: number;
    error?: string;
  };
  progress?: { completed?: number; total?: number };
};

type StageVoteSummary = {
  totalModels: number;
  positiveVotes: number;
  negativeVotes: number;
  majorityClass: 0 | 1;
  modelVotes?: Array<{
    modelFilename: string;
    predictedClass: number | null;
    maxProb: number | null;
  }>;
};

type ActivityItem = {
  id: string;
  stage: StageNumber;
  modelFilename: string;
  predictedClass: number | null;
  confidencePct: number | null;
  error: string | null;
  detail?: string | null;
};

export type HelminthPredictPanelProps = {
  predictionApiDelegateToken: string | null;
};

function wsUrlForStage(stage: StageNumber, jobId: string): string {
  const origin =
    stage === 1
      ? getStage1WsOriginForClient()
      : stage === 2
        ? getStage2WsOriginForClient()
        : getStage3WsOriginForClient();
  return `${origin}/ws/${jobId}`;
}

function shortModelName(filename: string): string {
  return filename
    .replace(/\.keras$/i, "")
    .replace(/\.pt$/i, "")
    .replace(/^HELMINTHS_BINARY_/i, "")
    .replace(/^BINARY_/i, "");
}

function classLabel(stage: StageNumber, predictedClass: number | null): string {
  if (stage === 3) return "Species localization";
  if (predictedClass === null) return "Unknown";
  if (stage === 1) {
    return predictedClass === 0 ? "Fecal" : "Non fecal";
  }
  return predictedClass === 0 ? "Helminth detected" : "No helminth";
}

function toConfidencePercent(
  classification: {
    predicted_class?: number;
    max_prob?: number;
    probability?: number;
    class_probabilities?: Record<string, number>;
  } | undefined,
): number | null {
  if (!classification) return null;
  const predictedClass =
    classification.predicted_class === 0 || classification.predicted_class === 1
      ? classification.predicted_class
      : null;
  if (
    predictedClass !== null &&
    classification.class_probabilities &&
    typeof classification.class_probabilities[String(predictedClass)] === "number"
  ) {
    const value = classification.class_probabilities[String(predictedClass)]!;
    return value <= 1 ? value * 100 : value;
  }
  if (typeof classification.max_prob === "number") {
    return classification.max_prob <= 1
      ? classification.max_prob * 100
      : classification.max_prob;
  }
  return null;
}

function countPredictionsBeforeRow(results: unknown[], rowIndex: number): number {
  let n = 0;
  const arr = results as Array<Record<string, unknown>>;
  for (let k = 0; k < rowIndex && k < arr.length; k++) {
    const pred = arr[k]?.prediction as { predictions?: unknown[] } | undefined;
    n += Array.isArray(pred?.predictions) ? pred.predictions.length : 0;
  }
  return n;
}

function mapDbStageStatus(
  status: PipelineSubmitResponse["stage1Status"],
): StepStatus {
  if (status === "finished") return "complete";
  if (status === "skipped") return "skipped";
  if (status === "processing") return "active";
  return "idle";
}

function buildVoteSummaryFromResults(results: unknown[]): StageVoteSummary {
  let positiveVotes = 0;
  let negativeVotes = 0;
  for (const row of results) {
    const cls = (row as { classification?: { predicted_class?: unknown } })
      .classification?.predicted_class;
    if (cls === 0) positiveVotes += 1;
    if (cls === 1) negativeVotes += 1;
  }
  return {
    totalModels: results.length,
    positiveVotes,
    negativeVotes,
    majorityClass: positiveVotes > negativeVotes ? 0 : 1,
  };
}

export function HelminthPredictPanel({
  predictionApiDelegateToken,
}: HelminthPredictPanelProps) {
  const delegateAuthHeaders = useMemo(
    () =>
      predictionApiDelegateToken
        ? { Authorization: `Bearer ${predictionApiDelegateToken}` }
        : undefined,
    [predictionApiDelegateToken],
  );

  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [liveMessage, setLiveMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [preview, setPreview] = useState<{ results: unknown[]; errors: unknown[] } | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [stage1Status, setStage1Status] = useState<StepStatus>("idle");
  const [stage2Status, setStage2Status] = useState<StepStatus>("idle");
  const [stage3Status, setStage3Status] = useState<StepStatus>("idle");
  const [stage1Vote, setStage1Vote] = useState<StageVoteSummary | null>(null);
  const [stage2Vote, setStage2Vote] = useState<StageVoteSummary | null>(null);
  const [localImageUrl, setLocalImageUrl] = useState<string | null>(null);
  const [boxSourceSize, setBoxSourceSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [boxCoordinateMeta, setBoxCoordinateMeta] =
    useState<ImageBoxCoordinateMeta | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [gradcamPanel, setGradcamPanel] = useState<{
    phase: "idle" | "loading" | "complete" | "error";
    connectionError: string | null;
    byModel: Record<string, GradcamModelEntry>;
  }>({ phase: "idle", connectionError: null, byModel: {} });
  const [stage2GradcamPanel, setStage2GradcamPanel] = useState<{
    phase: "idle" | "loading" | "complete" | "error";
    connectionError: string | null;
    byModel: Record<string, GradcamModelEntry>;
  }>({ phase: "idle", connectionError: null, byModel: {} });
  const [pipelineOutcome, setPipelineOutcome] =
    useState<PipelineOutcome | null>(null);
  const [stage1JobId, setStage1JobId] = useState<string | null>(null);
  const [stage2JobId, setStage2JobId] = useState<string | null>(null);
  const [limeHistory, setLimeHistory] = useState<LimeRunEntry[]>([]);
  const [limeBusy, setLimeBusy] = useState(false);
  const [isCachedRun, setIsCachedRun] = useState(false);
  const [cacheSourceCreatedAt, setCacheSourceCreatedAt] = useState<string | null>(
    null,
  );
  const [explanationsStarted, setExplanationsStarted] = useState(false);
  const [explanationsStarting, setExplanationsStarting] = useState(false);
  const [forceRerun, setForceRerun] = useState(false);
  const [skipStage1, setSkipStage1] = useState(false);
  const [skipStage2, setSkipStage2] = useState(false);
  const [stage2LimeHistory, setStage2LimeHistory] = useState<LimeRunEntry[]>([]);
  const [stage2LimeBusy, setStage2LimeBusy] = useState(false);
  const [stage3ModelFilename, setStage3ModelFilename] = useState<string>(
    DEFAULT_STAGE3_MODEL_FILENAME,
  );
  const [stage3JobId, setStage3JobId] = useState<string | null>(null);
  const [stage3LimeHistory, setStage3LimeHistory] = useState<LimeRunEntry[]>([]);
  const [stage3LimeBusy, setStage3LimeBusy] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const gradcamWsRef = useRef<WebSocket | null>(null);
  const gradcamPingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const gradcamSessionRef = useRef(0);
  const pingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fallbackRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const runIdRef = useRef<string | null>(null);
  const currentStageRef = useRef<StageNumber | null>(null);
  const stage2StartedRef = useRef(false);
  const stage3StartedRef = useRef(false);
  const fileRef = useRef<File | null>(null);
  const limeWsRef = useRef<WebSocket | null>(null);
  const limePingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const limeEntryIdRef = useRef<string | null>(null);
  const stage2GradcamWsRef = useRef<WebSocket | null>(null);
  const stage2GradcamPingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stage2GradcamSessionRef = useRef(0);
  const stage2LimeWsRef = useRef<WebSocket | null>(null);
  const stage2LimePingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stage2LimeEntryIdRef = useRef<string | null>(null);
  const stage3LimeWsRef = useRef<WebSocket | null>(null);
  const stage3LimePingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stage3LimeEntryIdRef = useRef<string | null>(null);
  // Dedup keys for stream-per-model GradCAM uploads, scoped to the current run.
  const stage1GradcamUploadedRef = useRef<Set<string>>(new Set());
  const stage2GradcamUploadedRef = useRef<Set<string>>(new Set());
  const userSkipStage1Ref = useRef(false);
  const userSkipStage2Ref = useRef(false);
  const pipelineTerminalRef = useRef(false);
  const idempotencyKeyRef = useRef<string>(
    typeof crypto !== "undefined" ? crypto.randomUUID() : "local-idem",
  );
  const pendingSubmitAfterRecoveryRef = useRef(false);
  const [unfinishedRuns, setUnfinishedRuns] = useState<UnfinishedRunItem[]>([]);
  const [unfinishedMeta, setUnfinishedMeta] = useState({
    count: 0,
    limit: 3,
    canStartNew: true,
  });
  const [unfinishedSheetOpen, setUnfinishedSheetOpen] = useState(false);
  const [unfinishedRefreshing, setUnfinishedRefreshing] = useState(false);
  const [unfinishedBusyRunId, setUnfinishedBusyRunId] = useState<string | null>(
    null,
  );
  const [unfinishedBulkBusy, setUnfinishedBulkBusy] = useState(false);

  useEffect(() => {
    if (!file) {
      setLocalImageUrl(null);
      setBoxSourceSize(null);
      setBoxCoordinateMeta(null);
      setPreviewLoading(false);
      setPreviewError(null);
      return;
    }

    let cancelled = false;
    let createdUrl: string | null = null;
    setPreviewLoading(true);
    setPreviewError(null);
    setLocalImageUrl(null);

    void Promise.all([previewUrlFromFile(file), readImageBoxCoordinateMetaFromFile(file)])
      .then(([preview, meta]) => {
        if (cancelled) {
          revokePreviewUrl(preview.url);
          return;
        }
        createdUrl = preview.url;
        setLocalImageUrl(preview.url);
        setBoxCoordinateMeta(meta);
        if (preview.sourceWidth && preview.sourceHeight) {
          setBoxSourceSize({
            width: preview.sourceWidth,
            height: preview.sourceHeight,
          });
        } else {
          setBoxSourceSize(null);
        }
        setPreviewLoading(false);
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        const message =
          reason instanceof Error
            ? reason.message
            : "Could not preview this TIFF image.";
        setPreviewError(message);
        setPreviewLoading(false);
        toast.error("Image preview unavailable", { description: message });
      });

    return () => {
      cancelled = true;
      revokePreviewUrl(createdUrl);
    };
  }, [file]);

  const stepperStatuses: { status: StepStatus }[] = useMemo(
    () => [
      { status: stage1Status },
      { status: stage2Status },
      { status: stage3Status },
    ],
    [stage1Status, stage2Status, stage3Status],
  );

  const isRunning =
    stage1Status === "active" ||
    stage2Status === "active" ||
    stage3Status === "active";
  const pct =
    progress.total > 0
      ? Math.min(100, Math.round((progress.done / progress.total) * 100))
      : 0;

  // Broadcast stage state so the dashboard hero / card header can show a live
  // pipeline indicator without lifting state out of this panel.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const activeStage =
      stage3Status === "active"
        ? 3
        : stage2Status === "active"
          ? 2
          : stage1Status === "active"
            ? 1
            : null;
    window.dispatchEvent(
      new CustomEvent("predict:status", {
        detail: { running: activeStage !== null, stage: activeStage },
      }),
    );
  }, [stage1Status, stage2Status, stage3Status]);

  const clearTimers = useCallback(() => {
    if (pingRef.current) {
      clearInterval(pingRef.current);
      pingRef.current = null;
    }
    if (fallbackRef.current) {
      clearInterval(fallbackRef.current);
      fallbackRef.current = null;
    }
  }, []);

  const teardownWs = useCallback(() => {
    clearTimers();
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, [clearTimers]);

  const teardownGradcamWs = useCallback(() => {
    if (gradcamPingRef.current) {
      clearInterval(gradcamPingRef.current);
      gradcamPingRef.current = null;
    }
    if (gradcamWsRef.current) {
      gradcamWsRef.current.close();
      gradcamWsRef.current = null;
    }
  }, []);

  const teardownLimeWs = useCallback(() => {
    if (limePingRef.current) {
      clearInterval(limePingRef.current);
      limePingRef.current = null;
    }
    if (limeWsRef.current) {
      limeWsRef.current.close();
      limeWsRef.current = null;
    }
  }, []);

  const teardownStage2GradcamWs = useCallback(() => {
    if (stage2GradcamPingRef.current) {
      clearInterval(stage2GradcamPingRef.current);
      stage2GradcamPingRef.current = null;
    }
    if (stage2GradcamWsRef.current) {
      stage2GradcamWsRef.current.close();
      stage2GradcamWsRef.current = null;
    }
  }, []);

  const teardownStage2LimeWs = useCallback(() => {
    if (stage2LimePingRef.current) {
      clearInterval(stage2LimePingRef.current);
      stage2LimePingRef.current = null;
    }
    if (stage2LimeWsRef.current) {
      stage2LimeWsRef.current.close();
      stage2LimeWsRef.current = null;
    }
  }, []);

  const teardownStage3LimeWs = useCallback(() => {
    if (stage3LimePingRef.current) {
      clearInterval(stage3LimePingRef.current);
      stage3LimePingRef.current = null;
    }
    if (stage3LimeWsRef.current) {
      stage3LimeWsRef.current.close();
      stage3LimeWsRef.current = null;
    }
  }, []);

  /**
   * Fire-and-forget POST of one PNG explanation to the run's R2 prefix.
   * Failures only warn — they never block the live UI.
   */
  const uploadExplanationPng = useCallback(
    async (params: {
      stage: 1 | 2 | 3;
      kind: "gradcam" | "lime";
      modelFilename: string;
      dataUrl: string;
      numSamples?: number;
    }) => {
      const runId = runIdRef.current;
      if (!runId) return;
      try {
        const blob = await (await fetch(params.dataUrl)).blob();
        const fd = new FormData();
        fd.set("stage", String(params.stage));
        fd.set("modelFilename", params.modelFilename);
        fd.set("file", blob, `${params.kind}.png`);
        if (params.kind === "lime" && typeof params.numSamples === "number") {
          fd.set("numSamples", String(params.numSamples));
        }
        const res = await fetch(
          `/api/predictions/pipeline-run/${encodeURIComponent(runId)}/explanations/${params.kind}`,
          {
            method: "POST",
            body: fd,
            credentials: "include",
            headers: delegateAuthHeaders,
          },
        );
        if (!res.ok) {
          const data = (await res
            .json()
            .catch(() => null)) as { error?: string } | null;
          console.warn(
            `[explanations] ${params.kind} upload failed`,
            data?.error ?? res.statusText,
          );
        }
      } catch (reason) {
        console.warn(`[explanations] ${params.kind} upload error`, reason);
      }
    },
    [delegateAuthHeaders],
  );

  const connectStage1Gradcam = useCallback(
    (jobId: string) => {
      teardownGradcamWs();
      stage1GradcamUploadedRef.current = new Set();
      const sessionId = ++gradcamSessionRef.current;
      const initial: Record<string, GradcamModelEntry> = {};
      for (const m of STAGE1_MODEL_FILENAMES) {
        initial[m] = { status: "pending" };
      }
      setGradcamPanel({
        phase: "loading",
        connectionError: null,
        byModel: initial,
      });

      let ws: WebSocket;
      try {
        ws = new WebSocket(getStage1GradcamWsUrl(jobId));
      } catch {
        setGradcamPanel({
          phase: "error",
          connectionError: "Could not open Grad CAM connection.",
          byModel: initial,
        });
        return;
      }
      gradcamWsRef.current = ws;

      ws.onopen = () => {
        if (sessionId !== gradcamSessionRef.current) return;
        gradcamPingRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) ws.send("ping");
        }, 15000);
      };

      ws.onmessage = (evt) => {
        if (sessionId !== gradcamSessionRef.current) return;
        try {
          const raw = JSON.parse(String(evt.data)) as unknown;
          const parsed = extractGradcamPayload(raw, STAGE1_MODEL_FILENAMES);
          // Side effect: persist each model's overlay to R2 once per run.
          if (
            parsed.modelKey &&
            parsed.imageSrc &&
            !stage1GradcamUploadedRef.current.has(parsed.modelKey)
          ) {
            stage1GradcamUploadedRef.current.add(parsed.modelKey);
            void uploadExplanationPng({
              stage: 1,
              kind: "gradcam",
              modelFilename: parsed.modelKey,
              dataUrl: parsed.imageSrc,
            });
          }
          setGradcamPanel((prev) => {
            const nextMap = { ...prev.byModel };

            if (parsed.isFinished) {
              const gotAny = STAGE1_MODEL_FILENAMES.some(
                (fn) => nextMap[fn]?.status !== "pending",
              );
              // Ignore a stray `finished` before any model payload (would close the socket early).
              if (!gotAny) {
                return prev;
              }
              for (const fn of STAGE1_MODEL_FILENAMES) {
                if (nextMap[fn]?.status === "pending") {
                  nextMap[fn] = {
                    status: "error",
                    error: "No Grad CAM output received.",
                  };
                }
              }
            } else if (parsed.modelKey) {
              if (parsed.imageSrc) {
                nextMap[parsed.modelKey] = {
                  status: "ok",
                  imageSrc: parsed.imageSrc,
                };
              } else {
                nextMap[parsed.modelKey] = {
                  status: "error",
                  error:
                    parsed.errorText?.trim() ||
                    "Grad CAM unavailable for this model.",
                };
              }
            }

            const accounted = STAGE1_MODEL_FILENAMES.every(
              (fn) => nextMap[fn]?.status !== "pending",
            );
            const phase: "loading" | "complete" = accounted ? "complete" : "loading";

            if (accounted) {
              queueMicrotask(() => teardownGradcamWs());
            }

            return {
              ...prev,
              byModel: nextMap,
              phase,
            };
          });
        } catch {
          /* ignore malformed frames */
        }
      };

      ws.onerror = () => {
        setGradcamPanel((prev) =>
          prev.phase === "loading"
            ? {
                ...prev,
                phase: "error",
                connectionError: "Grad CAM connection failed.",
              }
            : prev,
        );
        teardownGradcamWs();
      };

      ws.onclose = () => {
        if (gradcamPingRef.current) {
          clearInterval(gradcamPingRef.current);
          gradcamPingRef.current = null;
        }
        gradcamWsRef.current = null;
      };
    },
    [teardownGradcamWs, uploadExplanationPng],
  );

  const connectStage2Gradcam = useCallback(
    (jobId: string) => {
      teardownStage2GradcamWs();
      stage2GradcamUploadedRef.current = new Set();
      const sessionId = ++stage2GradcamSessionRef.current;
      const initial: Record<string, GradcamModelEntry> = {};
      for (const m of STAGE2_MODEL_FILENAMES) {
        initial[m] = { status: "pending" };
      }
      setStage2GradcamPanel({
        phase: "loading",
        connectionError: null,
        byModel: initial,
      });

      let ws: WebSocket;
      try {
        ws = new WebSocket(getStage2GradcamWsUrl(jobId));
      } catch {
        setStage2GradcamPanel({
          phase: "error",
          connectionError: "Could not open Grad CAM connection.",
          byModel: initial,
        });
        return;
      }
      stage2GradcamWsRef.current = ws;

      ws.onopen = () => {
        if (sessionId !== stage2GradcamSessionRef.current) return;
        stage2GradcamPingRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) ws.send("ping");
        }, 15000);
      };

      ws.onmessage = (evt) => {
        if (sessionId !== stage2GradcamSessionRef.current) return;
        try {
          const raw = JSON.parse(String(evt.data)) as unknown;
          const parsed = extractGradcamPayload(raw, STAGE2_MODEL_FILENAMES);
          if (
            parsed.modelKey &&
            parsed.imageSrc &&
            !stage2GradcamUploadedRef.current.has(parsed.modelKey)
          ) {
            stage2GradcamUploadedRef.current.add(parsed.modelKey);
            void uploadExplanationPng({
              stage: 2,
              kind: "gradcam",
              modelFilename: parsed.modelKey,
              dataUrl: parsed.imageSrc,
            });
          }
          setStage2GradcamPanel((prev) => {
            const nextMap = { ...prev.byModel };

            if (parsed.isFinished) {
              const gotAny = STAGE2_MODEL_FILENAMES.some(
                (fn) => nextMap[fn]?.status !== "pending",
              );
              if (!gotAny) {
                return prev;
              }
              for (const fn of STAGE2_MODEL_FILENAMES) {
                if (nextMap[fn]?.status === "pending") {
                  nextMap[fn] = {
                    status: "error",
                    error: "No Grad CAM output received.",
                  };
                }
              }
            } else if (parsed.modelKey) {
              if (parsed.imageSrc) {
                nextMap[parsed.modelKey] = {
                  status: "ok",
                  imageSrc: parsed.imageSrc,
                };
              } else {
                nextMap[parsed.modelKey] = {
                  status: "error",
                  error:
                    parsed.errorText?.trim() ||
                    "Grad CAM unavailable for this model.",
                };
              }
            }

            const accounted = STAGE2_MODEL_FILENAMES.every(
              (fn) => nextMap[fn]?.status !== "pending",
            );
            const phase: "loading" | "complete" = accounted ? "complete" : "loading";

            if (accounted) {
              queueMicrotask(() => teardownStage2GradcamWs());
            }

            return {
              ...prev,
              byModel: nextMap,
              phase,
            };
          });
        } catch {
          /* ignore malformed frames */
        }
      };

      ws.onerror = () => {
        setStage2GradcamPanel((prev) =>
          prev.phase === "loading"
            ? {
                ...prev,
                phase: "error",
                connectionError: "Grad CAM connection failed.",
              }
            : prev,
        );
        teardownStage2GradcamWs();
      };

      ws.onclose = () => {
        if (stage2GradcamPingRef.current) {
          clearInterval(stage2GradcamPingRef.current);
          stage2GradcamPingRef.current = null;
        }
        stage2GradcamWsRef.current = null;
      };
    },
    [teardownStage2GradcamWs, uploadExplanationPng],
  );

  const handleStatusResultRef = useRef<
    ((runId: string, result: PipelineStatusPayload) => Promise<void>) | null
  >(null);

  const startFallbackSync = useCallback(
    (runId: string) => {
      if (fallbackRef.current) return;
      fallbackRef.current = setInterval(async () => {
        try {
          const res = await fetch(
            `/api/predictions/pipeline-run/${encodeURIComponent(runId)}/sync`,
            { credentials: "include", headers: delegateAuthHeaders },
          );
          const data = (await res.json()) as PipelineStatusPayload & { error?: string };
          if (!res.ok || !data.ok) return;
          await handleStatusResultRef.current?.(runId, data);
          if (data.runStatus === "finished" || data.runStatus === "failed") {
            clearInterval(fallbackRef.current!);
            fallbackRef.current = null;
          }
        } catch {
          /* keep polling */
        }
      }, 2000);
    },
    [delegateAuthHeaders],
  );

  const finishPipeline = useCallback(
    async (message: string) => {
      setLiveMessage(message);
      setStage1Status((prev) => (prev === "active" ? "complete" : prev));
      if (stage2Status === "active") {
        setStage2Status("complete");
      }
      if (stage3Status === "active") {
        setStage3Status("complete");
      }
      setProgress((prev) => ({ ...prev, done: prev.total }));
    },
    [stage2Status, stage3Status],
  );

  const commitTerminalOutcome = useCallback(
    (overrides?: {
      finalOutcome?: string | null;
      stage1Status?: StepStatus | PipelineSubmitResponse["stage1Status"];
      stage2Status?: StepStatus | PipelineSubmitResponse["stage2Status"];
      stage3Status?: StepStatus | PipelineSubmitResponse["stage3Status"];
      stage1Vote?: StageVoteSummary | null;
      stage2Vote?: StageVoteSummary | null;
      detectionCount?: number;
      skipStage1Requested?: boolean;
      skipStage2Requested?: boolean;
    }) => {
      const outcome = resolvePipelineTerminalOutcome({
        finalOutcome: overrides?.finalOutcome,
        stage1Status: overrides?.stage1Status ?? stage1Status,
        stage2Status: overrides?.stage2Status ?? stage2Status,
        stage3Status: overrides?.stage3Status ?? stage3Status,
        stage1Vote: overrides?.stage1Vote ?? stage1Vote,
        stage2Vote: overrides?.stage2Vote ?? stage2Vote,
        detectionCount:
          overrides?.detectionCount ??
          buildDetectionOverlayItemsFromResults(preview?.results).length,
        skipStage1Requested:
          overrides?.skipStage1Requested ?? userSkipStage1Ref.current,
        skipStage2Requested:
          overrides?.skipStage2Requested ?? userSkipStage2Ref.current,
      });
      if (!outcome) return false;
      if (pipelineTerminalRef.current) return true;
      pipelineTerminalRef.current = true;
      setPipelineOutcome(outcome);
      window.dispatchEvent(new Event("pipeline-run-saved"));
      toast.success("Run saved", {
        description: "Prediction history and stats were updated.",
      });
      return true;
    },
    [
      stage1Status,
      stage2Status,
      stage3Status,
      stage1Vote,
      stage2Vote,
      preview?.results,
    ],
  );

  const syncStageStatusesFromResult = useCallback(
    (result: PipelineStatusPayload) => {
      if (result.stage1Status) {
        setStage1Status(mapDbStageStatus(result.stage1Status));
      }
      if (result.stage2Status) {
        setStage2Status(mapDbStageStatus(result.stage2Status));
      }
      if (result.stage3Status) {
        setStage3Status(mapDbStageStatus(result.stage3Status));
      }
    },
    [],
  );

  const applyWsPayload = useCallback((msg: WsPayload, stage: StageNumber) => {
    if (msg.type === "connected" && Array.isArray(msg.results)) {
      setPreview({ results: msg.results, errors: (msg.errors as unknown[]) ?? [] });
    }
    if (typeof msg.total_models === "number") {
      setProgress((prev) => ({ ...prev, total: msg.total_models ?? prev.total }));
    }
    if (typeof msg.completed_models === "number") {
      setProgress((prev) => ({ ...prev, done: msg.completed_models ?? prev.done }));
    }
    if (msg.type === "prediction" && msg.data) {
      const row = msg.data;
      setPreview((prev) => {
        const next = { ...(prev ?? { results: [], errors: [] }) };
        next.results = [...(next.results as object[]), row as object];
        return next;
      });
      const preds = row.prediction?.predictions;
      if (Array.isArray(preds) && preds.length > 0) {
        preds.forEach((p, idx) => {
          const conf =
            typeof p.confidence === "number" && Number.isFinite(p.confidence)
              ? p.confidence <= 1
                ? p.confidence * 100
                : p.confidence
              : null;
          setActivity((prev) => [
            {
              id: `${Date.now()}-${idx}-${Math.random()}`,
              stage,
              modelFilename: String(row.modelFilename ?? "model"),
              predictedClass: null,
              confidencePct: conf,
              error: null,
              detail: String(p.class_name ?? "Detection"),
            },
            ...prev,
          ]);
        });
      } else {
        setActivity((prev) => [
          {
            id: `${Date.now()}-${Math.random()}`,
            stage,
            modelFilename: String(row.modelFilename ?? "model"),
            predictedClass:
              typeof row.classification?.predicted_class === "number"
                ? row.classification.predicted_class
                : null,
            confidencePct: toConfidencePercent(row.classification),
            error: null,
          },
          ...prev,
        ]);
      }
      setProgress((prev) => ({
        total: msg.progress?.total ?? prev.total,
        done: msg.progress?.completed ?? prev.done,
      }));
    }
    if (msg.type === "model_error" && msg.data) {
      const row = msg.data;
      setPreview((prev) => {
        const next = { ...(prev ?? { results: [], errors: [] }) };
        next.errors = [...(next.errors as object[]), row as object];
        return next;
      });
      setActivity((prev) => [
        {
          id: `${Date.now()}-${Math.random()}`,
          stage,
          modelFilename: String(row.modelFilename ?? "model"),
          predictedClass: null,
          confidencePct: null,
          error: String(row.error ?? "Error"),
        },
        ...prev,
      ]);
    }
    if (msg.type === "finished") {
      const results = (msg.results as unknown[]) ?? [];
      const errors = (msg.errors as unknown[]) ?? [];
      setPreview({ results, errors });
      if (typeof msg.completed_models === "number") {
        setProgress({ done: msg.completed_models, total: msg.total_models ?? results.length });
      }
      if (stage === 1) {
        setStage1Vote(buildVoteSummaryFromResults(results));
      } else if (stage === 2) {
        setStage2Vote(buildVoteSummaryFromResults(results));
      }
    }
  }, []);

  const connectWebSocket = useCallback(
    (externalJobId: string, runId: string, stage: StageNumber) => {
      teardownWs();
      currentStageRef.current = stage;
      setLiveMessage(
        stage === 1
          ? "Stage 1 started. Opening live connection…"
          : stage === 2
            ? "Stage 2 started. Opening live connection…"
            : "Stage 3 started. Opening live connection…",
      );
      let ws: WebSocket;
      try {
        ws = new WebSocket(wsUrlForStage(stage, externalJobId));
      } catch {
        setLiveMessage("WebSocket unavailable, syncing over HTTPS.");
        startFallbackSync(runId);
        return;
      }
      wsRef.current = ws;
      ws.onopen = () => {
        pingRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) ws.send("ping");
        }, 15000);
        // Open Grad CAM in parallel with stage predictions. Connecting only after
        // `finished` is often too late (job/session closed server-side before heatmaps emit).
        if (stage === 1) {
          setStage1JobId(externalJobId);
          connectStage1Gradcam(externalJobId);
        } else if (stage === 2) {
          setStage2JobId(externalJobId);
          connectStage2Gradcam(externalJobId);
        } else if (stage === 3) {
          setStage3JobId(externalJobId);
        }
      };
      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(String(evt.data)) as WsPayload;
          applyWsPayload(msg, stage);
          if (msg.type === "finished" || msg.status === "finished") {
            teardownWs();
            void (async () => {
              const res = await fetch(
                `/api/predictions/pipeline-run/${encodeURIComponent(runId)}/finalize`,
                {
                  method: "PATCH",
                  credentials: "include",
                  headers: delegateAuthHeaders,
                },
              );
              const data = (await res.json()) as PipelineStatusPayload & { error?: string };
              if (!res.ok || !data.ok) {
                throw new Error(data.error || "Finalize failed.");
              }
              await handleStatusResultRef.current?.(runId, data);
            })().catch((reason: unknown) => {
              const message =
                reason instanceof Error ? reason.message : "Finalize failed.";
              setError(message);
              setPipelineOutcome({ kind: "failed", stage, message });
              if (stage === 1) setStage1Status("idle");
              if (stage === 2) setStage2Status("idle");
              if (stage === 3) setStage3Status("idle");
            });
          }
        } catch {
          /* ignore malformed frames */
        }
      };
      ws.onerror = () => {
        setLiveMessage("WebSocket error, falling back to HTTPS sync.");
        teardownWs();
        startFallbackSync(runId);
      };
      ws.onclose = () => {
        clearTimers();
        wsRef.current = null;
      };
    },
    [
      applyWsPayload,
      clearTimers,
      delegateAuthHeaders,
      startFallbackSync,
      teardownWs,
      connectStage1Gradcam,
      connectStage2Gradcam,
    ],
  );

  const startStage2 = useCallback(
    async (runId: string) => {
      if (stage2StartedRef.current) return;
      stage2StartedRef.current = true;

      const originalFile = fileRef.current;
      if (!originalFile) {
        throw new Error(
          "Stage 2 requires the original image in this session. Re-run pipeline upload.",
        );
      }

      setStage2Status("active");
      setProgress({ done: 0, total: 0 });
      setLiveMessage("Stage 1 is fecal positive. Starting Stage 2 Helminth Screening…");

      const fd = new FormData();
      fd.set("image", originalFile);
      const res = await fetch(
        `/api/predictions/pipeline-run/${encodeURIComponent(runId)}/stage2`,
        {
          method: "POST",
          body: fd,
          credentials: "include",
          headers: delegateAuthHeaders,
        },
      );
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        stage?: { externalJobId?: string; totalModels?: number };
      };
      if (!res.ok || !data.ok || !data.stage?.externalJobId) {
        stage2StartedRef.current = false;
        throw new Error(data.error || "Could not start Stage 2.");
      }

      currentStageRef.current = 2;
      setProgress({ done: 0, total: data.stage.totalModels ?? 0 });
      setLiveMessage("Stage 2 started. Opening live connection…");
      connectWebSocket(data.stage.externalJobId, runId, 2);
    },
    [connectWebSocket, delegateAuthHeaders],
  );

  const startStage3 = useCallback(
    async (runId: string) => {
      if (stage3StartedRef.current) return;
      stage3StartedRef.current = true;

      const originalFile = fileRef.current;
      if (!originalFile) {
        throw new Error(
          "Stage 3 requires the original image in this session. Re-run pipeline upload.",
        );
      }

      setStage3Status("active");
      setProgress({ done: 0, total: 0 });
      setPreview(null);
      setLiveMessage("Helminth detected. Starting Stage 3 species localization…");

      const fd = new FormData();
      fd.set("image", originalFile);
      fd.set("modelFilename", stage3ModelFilename);
      const res = await fetch(
        `/api/predictions/pipeline-run/${encodeURIComponent(runId)}/stage3`,
        {
          method: "POST",
          body: fd,
          credentials: "include",
          headers: delegateAuthHeaders,
        },
      );
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        stage?: { externalJobId?: string; totalModels?: number };
      };
      if (!res.ok || !data.ok || !data.stage?.externalJobId) {
        stage3StartedRef.current = false;
        throw new Error(data.error || "Could not start Stage 3.");
      }

      currentStageRef.current = 3;
      setProgress({ done: 0, total: data.stage.totalModels ?? 0 });
      setLiveMessage("Stage 3 started. Opening live connection…");
      connectWebSocket(data.stage.externalJobId, runId, 3);
    },
    [connectWebSocket, delegateAuthHeaders, stage3ModelFilename],
  );

  const handleStatusResult = useCallback(
    async (runId: string, result: PipelineStatusPayload) => {
      if (pipelineTerminalRef.current) {
        return;
      }

      if (result.stage && result.remote) {
        applyWsPayload(result.remote as unknown as WsPayload, result.stage);
      }

      if (result.stage === 1 && result.persisted) {
        setStage1Status("complete");
      }

      const skip1 = result.skipStage1Requested ?? userSkipStage1Ref.current;
      const skip2 = result.skipStage2Requested ?? userSkipStage2Ref.current;

      if (result.gateDecision === "non_fecal" && !skip2) {
        setStage2Status("skipped");
        setStage3Status("skipped");
        finishPipeline(
          "Stage 1 majority vote is non fecal. Stage 2 skipped and run saved.",
        );
        commitTerminalOutcome({
          finalOutcome: "non_fecal",
          stage1Status: "finished",
          stage2Status: "skipped",
          stage3Status: "skipped",
          skipStage1Requested: skip1,
          skipStage2Requested: skip2,
        });
        return;
      }

      if (result.awaitingStage3Start) {
        if (skip2 || result.stage === 1) {
          setStage2Status("skipped");
        } else {
          setStage2Status("complete");
        }
        await startStage3(runId);
        return;
      }

      if (result.awaitingStage2Start) {
        setStage2Status("idle");
        await startStage2(runId);
        return;
      }

      if (result.runStatus === "finished") {
        if (result.stage === 3 || result.stage3Status === "finished") {
          setStage3Status("complete");
          finishPipeline("Pipeline complete. Species detection saved.");
          commitTerminalOutcome({
            finalOutcome: result.finalOutcome ?? "helminth_positive",
            stage3Status: "finished",
            skipStage1Requested: skip1,
            skipStage2Requested: skip2,
          });
          return;
        }

        if (
          result.finalOutcome === "helminth_negative" ||
          (result.stage2Status === "finished" &&
            result.stage3Status === "skipped")
        ) {
          setStage2Status("complete");
          setStage3Status("skipped");
          finishPipeline(
            "Stage 2 complete. No helminth detected — run saved.",
          );
          commitTerminalOutcome({
            finalOutcome: "helminth_negative",
            stage2Status: "finished",
            stage3Status: "skipped",
            skipStage1Requested: skip1,
            skipStage2Requested: skip2,
          });
          return;
        }

        if (
          result.finalOutcome === "non_fecal" ||
          (result.stage1Status === "finished" &&
            result.stage2Status === "skipped" &&
            result.stage3Status === "skipped")
        ) {
          setStage1Status("complete");
          setStage2Status("skipped");
          setStage3Status("skipped");
          finishPipeline(
            "Stage 1 majority vote is non fecal. Stage 2 skipped and run saved.",
          );
          commitTerminalOutcome({
            finalOutcome: "non_fecal",
            stage1Status: "finished",
            stage2Status: "skipped",
            stage3Status: "skipped",
            skipStage1Requested: skip1,
            skipStage2Requested: skip2,
          });
          return;
        }

        if (result.idempotent && result.stage === null) {
          syncStageStatusesFromResult(result);
          commitTerminalOutcome({
            finalOutcome: result.finalOutcome,
            stage1Status: result.stage1Status,
            stage2Status: result.stage2Status,
            stage3Status: result.stage3Status,
            skipStage1Requested: skip1,
            skipStage2Requested: skip2,
          });
          return;
        }

        if (result.stage === 2) {
          setStage2Status("complete");
          setStage3Status("skipped");
          finishPipeline("Pipeline complete. Results saved.");
          commitTerminalOutcome({
            finalOutcome: result.finalOutcome ?? "helminth_negative",
            stage2Status: "finished",
            stage3Status: "skipped",
            skipStage1Requested: skip1,
            skipStage2Requested: skip2,
          });
        }
      }
    },
    [
      applyWsPayload,
      commitTerminalOutcome,
      finishPipeline,
      startStage2,
      startStage3,
      syncStageStatusesFromResult,
    ],
  );

  useEffect(() => {
    handleStatusResultRef.current = handleStatusResult;
  }, [handleStatusResult]);

  const refreshUnfinishedRuns = useCallback(async () => {
    setUnfinishedRefreshing(true);
    try {
      const res = await fetch("/api/predictions/pipeline-run/processing", {
        credentials: "include",
        headers: delegateAuthHeaders,
        cache: "no-store",
      });
      const data = (await res.json()) as UnfinishedRunsResponse & { error?: string };
      if (!res.ok || !data.ok) return;
      setUnfinishedRuns(data.runs);
      setUnfinishedMeta({
        count: data.count,
        limit: data.limit,
        canStartNew: data.canStartNew,
      });
    } finally {
      setUnfinishedRefreshing(false);
    }
  }, [delegateAuthHeaders]);

  useEffect(() => {
    void refreshUnfinishedRuns();
  }, [refreshUnfinishedRuns]);

  useEffect(() => {
    if (pipelineOutcome) {
      void refreshUnfinishedRuns();
    }
  }, [pipelineOutcome, refreshUnfinishedRuns]);

  const applyResumeResult = useCallback(
    async (data: PipelineResumeResponse) => {
      runIdRef.current = data.id;
      setUnfinishedSheetOpen(false);
      setError(null);
      setPipelineOutcome(null);
      pipelineTerminalRef.current = false;
      stage2StartedRef.current = false;
      stage3StartedRef.current = false;

      if (data.resumeKind === "sync" && data.sync) {
        await handleStatusResultRef.current?.(data.id, data.sync);
        void refreshUnfinishedRuns();
        return;
      }

      if (
        data.resumeKind === "websocket" &&
        data.stage &&
        data.externalJobId
      ) {
        currentStageRef.current = data.stage;
        setProgress({ done: 0, total: data.totalModels ?? 0 });
        if (data.stage === 1) {
          setStage1Status("active");
        } else if (data.stage === 2) {
          setStage2Status("active");
        } else {
          setStage3Status("active");
        }
        setLiveMessage(`Resumed Stage ${data.stage}. Opening live connection…`);
        connectWebSocket(data.externalJobId, data.id, data.stage);
        void refreshUnfinishedRuns();
      }
    },
    [connectWebSocket, refreshUnfinishedRuns],
  );

  const handleCancelUnfinishedRun = useCallback(
    async (runId: string) => {
      setUnfinishedBusyRunId(runId);
      try {
        const res = await fetch(
          `/api/predictions/pipeline-run/${encodeURIComponent(runId)}/cancel`,
          {
            method: "POST",
            credentials: "include",
            headers: delegateAuthHeaders,
          },
        );
        const data = (await res.json()) as { ok?: boolean; error?: string };
        if (!res.ok || !data.ok) {
          throw new Error(data.error || "Could not cancel run.");
        }
        await refreshUnfinishedRuns();
        toast.success("Run cancelled", {
          description: "You can start a new prediction now.",
        });
      } catch (reason) {
        const message =
          reason instanceof Error ? reason.message : "Could not cancel run.";
        toast.error(message);
      } finally {
        setUnfinishedBusyRunId(null);
      }
    },
    [delegateAuthHeaders, refreshUnfinishedRuns],
  );

  const handleResumeUnfinishedRun = useCallback(
    async (runId: string) => {
      setUnfinishedBusyRunId(runId);
      try {
        teardownWs();
        const res = await fetch(
          `/api/predictions/pipeline-run/${encodeURIComponent(runId)}/resume`,
          {
            method: "POST",
            credentials: "include",
            headers: delegateAuthHeaders,
          },
        );
        const data = (await res.json()) as PipelineResumeResponse & {
          error?: string;
        };
        if (!res.ok || !data.ok) {
          throw new Error(data.error || "Could not resume run.");
        }
        await applyResumeResult(data);
      } catch (reason) {
        const message =
          reason instanceof Error ? reason.message : "Could not resume run.";
        toast.error(message);
      } finally {
        setUnfinishedBusyRunId(null);
      }
    },
    [applyResumeResult, delegateAuthHeaders, teardownWs],
  );

  const handleCancelAllStaleRuns = useCallback(async () => {
    setUnfinishedBulkBusy(true);
    try {
      const res = await fetch(
        "/api/predictions/pipeline-run/processing/cancel-stale",
        {
          method: "POST",
          credentials: "include",
          headers: delegateAuthHeaders,
        },
      );
      const data = (await res.json()) as { ok?: boolean; cancelled?: number; error?: string };
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Could not cancel stalled runs.");
      }
      await refreshUnfinishedRuns();
      toast.success("Stalled runs cleared", {
        description:
          data.cancelled && data.cancelled > 0
            ? `${data.cancelled} run(s) cancelled.`
            : "No stalled runs needed clearing.",
      });
    } catch (reason) {
      const message =
        reason instanceof Error ? reason.message : "Could not cancel stalled runs.";
      toast.error(message);
    } finally {
      setUnfinishedBulkBusy(false);
    }
  }, [delegateAuthHeaders, refreshUnfinishedRuns]);

  useEffect(
    () => () => {
      teardownWs();
      teardownGradcamWs();
      teardownLimeWs();
      teardownStage2GradcamWs();
      teardownStage2LimeWs();
    },
    [
      teardownWs,
      teardownGradcamWs,
      teardownLimeWs,
      teardownStage2GradcamWs,
      teardownStage2LimeWs,
    ],
  );

  /**
   * Soft client reset: tear down every open WS, clear refs, clear panel state.
   * Used by both the "Start a new prediction" button and `onSubmit` when a new
   * run begins. Does NOT touch auth, tabs, or any state outside this panel.
   */
  const resetPanelState = useCallback(
    (opts?: { keepFile?: boolean; scroll?: boolean }) => {
      teardownWs();
      teardownGradcamWs();
      teardownLimeWs();
      teardownStage2GradcamWs();
      teardownStage2LimeWs();
      teardownStage3LimeWs();
      stage2StartedRef.current = false;
      stage3StartedRef.current = false;
      runIdRef.current = null;
      currentStageRef.current = null;
      limeEntryIdRef.current = null;
      stage2LimeEntryIdRef.current = null;
      stage3LimeEntryIdRef.current = null;
      setStage1JobId(null);
      setStage2JobId(null);
      setStage3JobId(null);
      if (!opts?.keepFile) {
        setStage3ModelFilename(DEFAULT_STAGE3_MODEL_FILENAME);
      }
      setIsCachedRun(false);
      setCacheSourceCreatedAt(null);
      setExplanationsStarted(false);
      setExplanationsStarting(false);
      if (!opts?.keepFile) {
        setForceRerun(false);
        setSkipStage1(false);
        setSkipStage2(false);
        userSkipStage1Ref.current = false;
        userSkipStage2Ref.current = false;
      }
      idempotencyKeyRef.current = crypto.randomUUID();
      if (!opts?.keepFile) {
        fileRef.current = null;
        setFile(null);
      }
      setGradcamPanel({ phase: "idle", connectionError: null, byModel: {} });
      setStage2GradcamPanel({ phase: "idle", connectionError: null, byModel: {} });
      setLimeHistory([]);
      setLimeBusy(false);
      setStage2LimeHistory([]);
      setStage2LimeBusy(false);
      setStage3LimeHistory([]);
      setStage3LimeBusy(false);
      setError(null);
      setPreview(null);
      setActivity([]);
      setStage1Vote(null);
      setStage2Vote(null);
      setStage1Status("idle");
      setStage2Status("idle");
      setStage3Status("idle");
      setProgress({ done: 0, total: 0 });
      setLiveMessage("");
      setPipelineOutcome(null);
      setPreviewLoading(false);
      setPreviewError(null);
      pipelineTerminalRef.current = false;
      if (opts?.scroll && typeof document !== "undefined") {
        const target = document.getElementById("dashboard-predict-card");
        if (target) {
          target.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }
    },
    [
      teardownGradcamWs,
      teardownLimeWs,
      teardownStage2GradcamWs,
      teardownStage2LimeWs,
      teardownStage3LimeWs,
      teardownWs,
    ],
  );

  const runLime = useCallback(
    (modelFilename: string, numSamples: number) => {
      const jobId = stage1JobId;
      if (!jobId) {
        toast.error("LIME unavailable", {
          description: "Run a Stage 1 prediction first.",
        });
        return;
      }
      if (limeBusy) return;

      const clamped = Math.max(10, Math.min(1000, Math.round(numSamples)));
      const entryId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      limeEntryIdRef.current = entryId;
      teardownLimeWs();

      const entry: LimeRunEntry = {
        id: entryId,
        modelFilename,
        numSamples: clamped,
        status: "streaming",
        startedAt: Date.now(),
        progressPct: null,
      };
      setLimeHistory((prev) => [entry, ...prev]);
      setLimeBusy(true);

      let ws: WebSocket;
      try {
        ws = new WebSocket(getStage1LimeWsUrl(jobId));
      } catch {
        setLimeHistory((prev) =>
          prev.map((e) =>
            e.id === entryId
              ? { ...e, status: "error", error: "Could not open LIME connection." }
              : e,
          ),
        );
        setLimeBusy(false);
        return;
      }
      limeWsRef.current = ws;

      ws.onopen = () => {
        try {
          ws.send(
            JSON.stringify({
              modelFilename,
              numSamples: clamped,
            }),
          );
        } catch {
          /* WS closed before send */
        }
        limePingRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) ws.send("ping");
        }, 15000);
      };

      ws.onmessage = (evt) => {
        try {
          const raw = JSON.parse(String(evt.data)) as unknown;
          const parsed = extractLimePayload(raw, STAGE1_MODEL_FILENAMES);

          if (parsed.imageSrc) {
            void uploadExplanationPng({
              stage: 1,
              kind: "lime",
              modelFilename,
              dataUrl: parsed.imageSrc,
              numSamples: clamped,
            });
            setLimeHistory((prev) =>
              prev.map((e) =>
                e.id === entryId
                  ? {
                      ...e,
                      status: "ok",
                      imageSrc: parsed.imageSrc!,
                      progressPct: 100,
                    }
                  : e,
              ),
            );
            setLimeBusy(false);
            limeEntryIdRef.current = null;
            queueMicrotask(() => teardownLimeWs());
            return;
          }

          if (parsed.errorText) {
            setLimeHistory((prev) =>
              prev.map((e) =>
                e.id === entryId
                  ? { ...e, status: "error", error: parsed.errorText! }
                  : e,
              ),
            );
            setLimeBusy(false);
            limeEntryIdRef.current = null;
            queueMicrotask(() => teardownLimeWs());
            return;
          }

          if (parsed.progressPct !== null) {
            setLimeHistory((prev) =>
              prev.map((e) =>
                e.id === entryId
                  ? { ...e, progressPct: parsed.progressPct }
                  : e,
              ),
            );
          }

          if (parsed.isFinished) {
            // Reached "finished" without an image: mark as error if still streaming.
            setLimeHistory((prev) =>
              prev.map((e) =>
                e.id === entryId && e.status === "streaming"
                  ? {
                      ...e,
                      status: "error",
                      error: "No LIME output received.",
                    }
                  : e,
              ),
            );
            setLimeBusy(false);
            limeEntryIdRef.current = null;
            queueMicrotask(() => teardownLimeWs());
          }
        } catch {
          /* ignore malformed frames */
        }
      };

      ws.onerror = () => {
        setLimeHistory((prev) =>
          prev.map((e) =>
            e.id === entryId && e.status === "streaming"
              ? {
                  ...e,
                  status: "error",
                  error:
                    "LIME connection failed. The Stage 1 job may have expired; re-run a prediction.",
                }
              : e,
          ),
        );
        setLimeBusy(false);
        limeEntryIdRef.current = null;
        teardownLimeWs();
      };

      ws.onclose = () => {
        if (limePingRef.current) {
          clearInterval(limePingRef.current);
          limePingRef.current = null;
        }
        limeWsRef.current = null;
        // If the WS closes without ever delivering an image, surface the error
        // and free the busy flag so the user can retry.
        if (limeEntryIdRef.current === entryId) {
          setLimeHistory((prev) =>
            prev.map((e) =>
              e.id === entryId && e.status === "streaming"
                ? {
                    ...e,
                    status: "error",
                    error:
                      "LIME connection closed before any output. The Stage 1 job may have expired; re-run a prediction.",
                  }
                : e,
            ),
          );
          setLimeBusy(false);
          limeEntryIdRef.current = null;
        }
      };
    },
    [limeBusy, stage1JobId, teardownLimeWs, uploadExplanationPng],
  );

  const runStage2Lime = useCallback(
    (modelFilename: string, numSamples: number) => {
      const jobId = stage2JobId;
      if (!jobId) {
        toast.error("LIME unavailable", {
          description: "Run a Stage 2 prediction first.",
        });
        return;
      }
      if (stage2LimeBusy) return;

      const clamped = Math.max(10, Math.min(1000, Math.round(numSamples)));
      const entryId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      stage2LimeEntryIdRef.current = entryId;
      teardownStage2LimeWs();

      const entry: LimeRunEntry = {
        id: entryId,
        modelFilename,
        numSamples: clamped,
        status: "streaming",
        startedAt: Date.now(),
        progressPct: null,
      };
      setStage2LimeHistory((prev) => [entry, ...prev]);
      setStage2LimeBusy(true);

      let ws: WebSocket;
      try {
        ws = new WebSocket(getStage2LimeWsUrl(jobId));
      } catch {
        setStage2LimeHistory((prev) =>
          prev.map((e) =>
            e.id === entryId
              ? { ...e, status: "error", error: "Could not open LIME connection." }
              : e,
          ),
        );
        setStage2LimeBusy(false);
        return;
      }
      stage2LimeWsRef.current = ws;

      ws.onopen = () => {
        try {
          ws.send(
            JSON.stringify({
              modelFilename,
              numSamples: clamped,
            }),
          );
        } catch {
          /* WS closed before send */
        }
        stage2LimePingRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) ws.send("ping");
        }, 15000);
      };

      ws.onmessage = (evt) => {
        try {
          const raw = JSON.parse(String(evt.data)) as unknown;
          const parsed = extractLimePayload(raw, STAGE2_MODEL_FILENAMES);

          if (parsed.imageSrc) {
            void uploadExplanationPng({
              stage: 2,
              kind: "lime",
              modelFilename,
              dataUrl: parsed.imageSrc,
              numSamples: clamped,
            });
            setStage2LimeHistory((prev) =>
              prev.map((e) =>
                e.id === entryId
                  ? {
                      ...e,
                      status: "ok",
                      imageSrc: parsed.imageSrc!,
                      progressPct: 100,
                    }
                  : e,
              ),
            );
            setStage2LimeBusy(false);
            stage2LimeEntryIdRef.current = null;
            queueMicrotask(() => teardownStage2LimeWs());
            return;
          }

          if (parsed.errorText) {
            setStage2LimeHistory((prev) =>
              prev.map((e) =>
                e.id === entryId
                  ? { ...e, status: "error", error: parsed.errorText! }
                  : e,
              ),
            );
            setStage2LimeBusy(false);
            stage2LimeEntryIdRef.current = null;
            queueMicrotask(() => teardownStage2LimeWs());
            return;
          }

          if (parsed.progressPct !== null) {
            setStage2LimeHistory((prev) =>
              prev.map((e) =>
                e.id === entryId
                  ? { ...e, progressPct: parsed.progressPct }
                  : e,
              ),
            );
          }

          if (parsed.isFinished) {
            setStage2LimeHistory((prev) =>
              prev.map((e) =>
                e.id === entryId && e.status === "streaming"
                  ? {
                      ...e,
                      status: "error",
                      error: "No LIME output received.",
                    }
                  : e,
              ),
            );
            setStage2LimeBusy(false);
            stage2LimeEntryIdRef.current = null;
            queueMicrotask(() => teardownStage2LimeWs());
          }
        } catch {
          /* ignore malformed frames */
        }
      };

      ws.onerror = () => {
        setStage2LimeHistory((prev) =>
          prev.map((e) =>
            e.id === entryId && e.status === "streaming"
              ? {
                  ...e,
                  status: "error",
                  error:
                    "LIME connection failed. The Stage 2 job may have expired; re-run a prediction.",
                }
              : e,
          ),
        );
        setStage2LimeBusy(false);
        stage2LimeEntryIdRef.current = null;
        teardownStage2LimeWs();
      };

      ws.onclose = () => {
        if (stage2LimePingRef.current) {
          clearInterval(stage2LimePingRef.current);
          stage2LimePingRef.current = null;
        }
        stage2LimeWsRef.current = null;
        if (stage2LimeEntryIdRef.current === entryId) {
          setStage2LimeHistory((prev) =>
            prev.map((e) =>
              e.id === entryId && e.status === "streaming"
                ? {
                    ...e,
                    status: "error",
                    error:
                      "LIME connection closed before any output. The Stage 2 job may have expired; re-run a prediction.",
                  }
                : e,
            ),
          );
          setStage2LimeBusy(false);
          stage2LimeEntryIdRef.current = null;
        }
      };
    },
    [stage2JobId, stage2LimeBusy, teardownStage2LimeWs, uploadExplanationPng],
  );

  const runStage3Lime = useCallback(
    (modelFilename: string, numSamples: number) => {
      const jobId = stage3JobId;
      if (!jobId) {
        toast.error("LIME unavailable", {
          description: "Run a Stage 3 prediction first.",
        });
        return;
      }
      if (stage3LimeBusy) return;

      const clamped = Math.max(10, Math.min(1000, Math.round(numSamples)));
      const entryId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      stage3LimeEntryIdRef.current = entryId;
      teardownStage3LimeWs();

      const entry: LimeRunEntry = {
        id: entryId,
        modelFilename,
        numSamples: clamped,
        status: "streaming",
        startedAt: Date.now(),
        progressPct: null,
      };
      setStage3LimeHistory((prev) => [entry, ...prev]);
      setStage3LimeBusy(true);

      let ws: WebSocket;
      try {
        ws = new WebSocket(getStage3LimeWsUrl(jobId));
      } catch {
        setStage3LimeHistory((prev) =>
          prev.map((e) =>
            e.id === entryId
              ? { ...e, status: "error", error: "Could not open LIME connection." }
              : e,
          ),
        );
        setStage3LimeBusy(false);
        return;
      }
      stage3LimeWsRef.current = ws;

      ws.onopen = () => {
        try {
          ws.send(
            JSON.stringify({
              modelFilename,
              numSamples: clamped,
            }),
          );
        } catch {
          /* WS closed before send */
        }
        stage3LimePingRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) ws.send("ping");
        }, 15000);
      };

      ws.onmessage = (evt) => {
        try {
          const raw = JSON.parse(String(evt.data)) as unknown;
          const parsed = extractLimePayload(raw, STAGE3_MODEL_FILENAMES);

          if (parsed.imageSrc) {
            void uploadExplanationPng({
              stage: 3,
              kind: "lime",
              modelFilename,
              dataUrl: parsed.imageSrc,
              numSamples: clamped,
            });
            setStage3LimeHistory((prev) =>
              prev.map((e) =>
                e.id === entryId
                  ? {
                      ...e,
                      status: "ok",
                      imageSrc: parsed.imageSrc!,
                      progressPct: 100,
                    }
                  : e,
              ),
            );
            setStage3LimeBusy(false);
            stage3LimeEntryIdRef.current = null;
            queueMicrotask(() => teardownStage3LimeWs());
            return;
          }

          if (parsed.errorText) {
            setStage3LimeHistory((prev) =>
              prev.map((e) =>
                e.id === entryId
                  ? { ...e, status: "error", error: parsed.errorText! }
                  : e,
              ),
            );
            setStage3LimeBusy(false);
            stage3LimeEntryIdRef.current = null;
            queueMicrotask(() => teardownStage3LimeWs());
            return;
          }

          if (parsed.progressPct !== null) {
            setStage3LimeHistory((prev) =>
              prev.map((e) =>
                e.id === entryId
                  ? { ...e, progressPct: parsed.progressPct }
                  : e,
              ),
            );
          }

          if (parsed.isFinished) {
            setStage3LimeHistory((prev) =>
              prev.map((e) =>
                e.id === entryId && e.status === "streaming"
                  ? {
                      ...e,
                      status: "error",
                      error: "No LIME output received.",
                    }
                  : e,
              ),
            );
            setStage3LimeBusy(false);
            stage3LimeEntryIdRef.current = null;
            queueMicrotask(() => teardownStage3LimeWs());
          }
        } catch {
          /* ignore malformed frames */
        }
      };

      ws.onerror = () => {
        setStage3LimeHistory((prev) =>
          prev.map((e) =>
            e.id === entryId && e.status === "streaming"
              ? {
                  ...e,
                  status: "error",
                  error:
                    "LIME connection failed. The Stage 3 job may have expired; re-run a prediction.",
                }
              : e,
          ),
        );
        setStage3LimeBusy(false);
        stage3LimeEntryIdRef.current = null;
        teardownStage3LimeWs();
      };

      ws.onclose = () => {
        if (stage3LimePingRef.current) {
          clearInterval(stage3LimePingRef.current);
          stage3LimePingRef.current = null;
        }
        stage3LimeWsRef.current = null;
        if (stage3LimeEntryIdRef.current === entryId) {
          setStage3LimeHistory((prev) =>
            prev.map((e) =>
              e.id === entryId && e.status === "streaming"
                ? {
                    ...e,
                    status: "error",
                    error:
                      "LIME connection closed before any output. The Stage 3 job may have expired; re-run a prediction.",
                  }
                : e,
            ),
          );
          setStage3LimeBusy(false);
          stage3LimeEntryIdRef.current = null;
        }
      };
    },
    [
      stage3JobId,
      stage3LimeBusy,
      teardownStage3LimeWs,
      uploadExplanationPng,
    ],
  );

  const applyCachedResponse = useCallback(
    (data: PipelineSubmitResponse) => {
      runIdRef.current = data.id;
      setIsCachedRun(true);
      setCacheSourceCreatedAt(data.cacheSourceCreatedAt ?? null);
      setExplanationsStarted(false);

      if (data.stage1Status) setStage1Status(mapDbStageStatus(data.stage1Status));
      if (data.stage2Status) setStage2Status(mapDbStageStatus(data.stage2Status));
      if (data.stage3Status) setStage3Status(mapDbStageStatus(data.stage3Status));

      if (data.stage1VoteSummary) setStage1Vote(data.stage1VoteSummary);
      if (data.stage2VoteSummary) setStage2Vote(data.stage2VoteSummary);

      const results = extractPreviewResultsFromStoredRun({
        stage1ResultPayload: data.stage1ResultPayload,
        stage2ResultPayload: data.stage2ResultPayload,
        stage3ResultPayload: data.stage3ResultPayload,
        stage1VoteSummary: data.stage1VoteSummary ?? null,
        stage2VoteSummary: data.stage2VoteSummary ?? null,
      });

      setPreview({ results, errors: [] });
      setProgress({ done: 0, total: 0 });
      finishPipeline("Loaded cached prediction results.");
      commitTerminalOutcome({
        finalOutcome: data.finalOutcome,
        stage1Status: data.stage1Status,
        stage2Status: data.stage2Status,
        stage3Status: data.stage3Status,
      });
    },
    [commitTerminalOutcome, finishPipeline],
  );

  const startExplanations = useCallback(async () => {
    const runId = runIdRef.current;
    if (!runId || explanationsStarting) return;
    setExplanationsStarting(true);
    try {
      const res = await fetch(
        `/api/predictions/pipeline-run/${encodeURIComponent(runId)}/start-explanations`,
        {
          method: "POST",
          credentials: "include",
          headers: delegateAuthHeaders,
        },
      );
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        stage1?: { externalJobId: string };
        stage2?: { externalJobId: string };
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Could not start explanations.");
      }
      setExplanationsStarted(true);
      if (data.stage1?.externalJobId) {
        setStage1JobId(data.stage1.externalJobId);
        connectStage1Gradcam(data.stage1.externalJobId);
      }
      if (data.stage2?.externalJobId) {
        setStage2JobId(data.stage2.externalJobId);
        connectStage2Gradcam(data.stage2.externalJobId);
      }
    } catch (reason) {
      const message =
        reason instanceof Error ? reason.message : "Could not start explanations.";
      toast.error("Explanations unavailable", { description: message });
    } finally {
      setExplanationsStarting(false);
    }
  }, [
    connectStage1Gradcam,
    connectStage2Gradcam,
    delegateAuthHeaders,
    explanationsStarting,
  ]);

  const onSubmit = async (opts?: { force?: boolean }) => {
    if (!file) return;

    try {
      const slotRes = await fetch("/api/predictions/pipeline-run/processing", {
        credentials: "include",
        headers: delegateAuthHeaders,
        cache: "no-store",
      });
      const slotData = (await slotRes.json()) as UnfinishedRunsResponse & {
        error?: string;
      };
      if (slotRes.ok && slotData.ok) {
        setUnfinishedRuns(slotData.runs);
        setUnfinishedMeta({
          count: slotData.count,
          limit: slotData.limit,
          canStartNew: slotData.canStartNew,
        });
        if (!slotData.canStartNew) {
          pendingSubmitAfterRecoveryRef.current = true;
          setUnfinishedSheetOpen(true);
          setError(null);
          setLiveMessage("");
          return;
        }
      }
    } catch {
      /* proceed — server will enforce limit if check fails */
    }

    const useForce = opts?.force ?? forceRerun;
    const useSkipStage1 = skipStage1;
    const useSkipStage2 = skipStage2;
    resetPanelState({ keepFile: true });
    fileRef.current = file;
    if (useForce) setForceRerun(true);
    userSkipStage1Ref.current = useSkipStage1;
    userSkipStage2Ref.current = useSkipStage2;

    const startStage: StageNumber =
      useSkipStage1 && useSkipStage2 ? 3 : useSkipStage1 ? 2 : 1;

    if (useSkipStage1) setStage1Status("skipped");
    if (useSkipStage1 && useSkipStage2) setStage2Status("skipped");
    if (startStage === 1) setStage1Status("active");
    else if (startStage === 2) setStage2Status("active");
    else setStage3Status("active");

    setLiveMessage(
      useForce
        ? "Force re-running pipeline…"
        : startStage === 3
          ? "Uploading image and starting Stage 3…"
          : startStage === 2
            ? "Uploading image and starting Stage 2…"
            : "Uploading image and starting Stage 1…",
    );

    const fd = new FormData();
    fd.set("image", file);
    try {
      const imageHash = await computeImageHashSha256(file);
      fd.set("imageHash", imageHash);
      if (useForce) fd.set("forceRerun", "true");
      if (useSkipStage1) fd.set("skipStage1", "true");
      if (useSkipStage2) fd.set("skipStage2", "true");
      fd.set("stage3ModelFilename", stage3ModelFilename);
    } catch {
      /* hash optional — server still runs without cache */
    }

    const submitHeaders: Record<string, string> = {
      ...(delegateAuthHeaders ?? {}),
      "Idempotency-Key": idempotencyKeyRef.current,
    };

    try {
      const res = await fetch("/api/predictions/pipeline-run", {
        method: "POST",
        body: fd,
        credentials: "include",
        headers: submitHeaders,
      });
      const data = (await res.json()) as PipelineSubmitResponse & {
        error?: string;
        ok?: boolean;
      };
      if (!res.ok || !data.id) {
        if (res.status === 429) {
          pendingSubmitAfterRecoveryRef.current = true;
          await refreshUnfinishedRuns();
          setUnfinishedSheetOpen(true);
          setStage1Status("idle");
          setStage2Status("idle");
          setStage3Status("idle");
          setError(null);
          setLiveMessage("");
          return;
        }
        throw new Error(data.error || "Upload failed.");
      }

      if (data.cached) {
        applyCachedResponse(data);
        return;
      }

      if (!data.stage?.externalJobId) {
        throw new Error(data.error || "Upload failed.");
      }

      runIdRef.current = data.id;
      setProgress({ done: 0, total: data.stage.totalModels ?? 0 });

      if (data.stage.stage === 1) {
        connectWebSocket(data.stage.externalJobId, data.id, 1);
      } else if (data.stage.stage === 2) {
        connectWebSocket(data.stage.externalJobId, data.id, 2);
      } else {
        connectWebSocket(data.stage.externalJobId, data.id, 3);
      }
    } catch (reason) {
      const message =
        reason instanceof Error ? reason.message : "Upload failed.";
      if (
        message.includes("Too many runs in progress") ||
        message.includes("Too many runs")
      ) {
        pendingSubmitAfterRecoveryRef.current = true;
        await refreshUnfinishedRuns();
        setUnfinishedSheetOpen(true);
        setStage1Status("idle");
        setStage2Status("idle");
        setStage3Status("idle");
        setError(null);
        setLiveMessage("");
        return;
      }
      setStage1Status("idle");
      setStage2Status("idle");
      setStage3Status("idle");
      setError(message);
      setLiveMessage("");
      setPipelineOutcome({ kind: "failed", stage: null, message });
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const selected = e.dataTransfer.files?.[0];
    if (selected) setFile(selected);
  };

  const stage1ResultLabel =
    stage1Vote?.majorityClass === 0
      ? "Fecal"
      : stage1Vote?.majorityClass === 1
        ? "Non fecal"
        : stage1Status === "skipped"
          ? "Skipped (your selection)"
          : stage1Status === "active"
            ? "Running"
            : "Waiting";
  const stage2ResultLabel =
    stage2Vote?.majorityClass === 0
      ? "Helminth detected"
      : stage2Vote?.majorityClass === 1
        ? "No helminth"
        : stage2Status === "skipped"
          ? userSkipStage2Ref.current
            ? "Skipped (your selection)"
            : "Not run (Stage 1 was non fecal)"
          : stage2Status === "active"
            ? "Running"
            : "Waiting";

  const stage3ResultLabel =
    stage3Status === "complete"
      ? "Complete"
      : stage3Status === "active"
        ? "Running"
        : stage3Status === "skipped"
          ? userSkipStage2Ref.current || userSkipStage1Ref.current
            ? stage2Status === "skipped" && !userSkipStage2Ref.current
              ? "Not run (Stage 1 non fecal)"
              : "Not run (no helminth at Stage 2)"
            : stage2Status === "skipped"
              ? "Not run (Stage 1 non fecal)"
              : "Not run (no helminth)"
          : "Waiting";

  const detectionOverlayItems: DetectionBoxItem[] = useMemo(
    () => buildDetectionOverlayItemsFromResults(preview?.results),
    [preview?.results],
  );

  const runningStageLabel =
    stage3Status === "active"
      ? "Stage 3"
      : stage2Status === "active"
        ? "Stage 2"
        : "Stage 1";

  return (
    <div className="space-y-6">
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {liveMessage}
      </div>

      <div className="rounded-xl border border-border/60 bg-gradient-to-b from-background to-muted/20 p-5">
        <p className="mb-1 text-xs font-medium uppercase tracking-widest text-muted-foreground">
          Three phase pipeline
        </p>
        <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
          Three sequential gates: fecal classification, helminth screening, and
          species detection &mdash; each stage decides whether the next one runs.
        </p>
        <PipelineStepper steps={stepperStatuses} />
      </div>

      <UnfinishedRunsBanner
        count={unfinishedMeta.count}
        staleCount={unfinishedRuns.filter((run) => run.stale).length}
        onReview={() => setUnfinishedSheetOpen(true)}
      />

      <UnfinishedRunsSheet
        open={unfinishedSheetOpen}
        onOpenChange={(open) => {
          setUnfinishedSheetOpen(open);
          if (
            !open &&
            pendingSubmitAfterRecoveryRef.current &&
            unfinishedMeta.canStartNew &&
            fileRef.current
          ) {
            pendingSubmitAfterRecoveryRef.current = false;
            queueMicrotask(() => {
              void onSubmit();
            });
          }
        }}
        runs={unfinishedRuns}
        count={unfinishedMeta.count}
        limit={unfinishedMeta.limit}
        canStartNew={unfinishedMeta.canStartNew}
        busyRunId={unfinishedBusyRunId}
        bulkBusy={unfinishedBulkBusy}
        onRefresh={() => void refreshUnfinishedRuns()}
        refreshing={unfinishedRefreshing}
        onResume={(runId) => void handleResumeUnfinishedRun(runId)}
        onCancel={(runId) => void handleCancelUnfinishedRun(runId)}
        onCancelAllStale={() => void handleCancelAllStaleRuns()}
      />

      {error && pipelineOutcome?.kind !== "failed" && (
        <div
          className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{error}</span>
        </div>
      )}

      <div
        className={cn(
          "flex flex-col items-center gap-4 rounded-xl border-2 border-dashed px-6 py-12 text-center transition-all",
          isDragging
            ? "border-primary bg-primary/[0.04]"
            : "border-border bg-gradient-to-b from-muted/10 to-muted/30 hover:border-primary/40",
        )}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
      >
        <div className="flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Upload className="size-8" aria-hidden />
        </div>
        <div>
          <p className="text-base font-medium text-foreground">
            Full three stage pipeline
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            PNG, JPEG, WebP, or TIFF · max 15 MB
          </p>
        </div>
        <label className="cursor-pointer">
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/tiff,image/x-tiff,.tif,.tiff"
            className="sr-only"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <span className="inline-flex h-10 items-center justify-center rounded-md bg-secondary px-4 text-sm font-medium text-secondary-foreground hover:bg-secondary/90">
            Choose file
          </span>
        </label>
        {file && (
          <p className="text-xs text-muted-foreground">
            Selected: <span className="font-mono text-foreground">{file.name}</span>{" "}
            ({(file.size / 1024).toFixed(0)} KB)
          </p>
        )}
        <ForceFreshPredictionToggle
          checked={forceRerun}
          onChange={setForceRerun}
          disabled={isRunning}
        />
        <Stage3ModelSelect
          value={stage3ModelFilename}
          onChange={setStage3ModelFilename}
          disabled={isRunning}
        />
        <PipelineStageSkipControls
          skipStage1={skipStage1}
          skipStage2={skipStage2}
          onSkipStage1Change={setSkipStage1}
          onSkipStage2Change={setSkipStage2}
          disabled={isRunning}
        />
        <Button
          type="button"
          className="h-10"
          disabled={!file || isRunning}
          onClick={() => void onSubmit()}
        >
          {isRunning ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
              Pipeline running…
            </>
          ) : (
            <>
              <Radio className="mr-2 size-4" aria-hidden />
              Run staged pipeline
            </>
          )}
        </Button>
        {isRunning && (
          <div className="w-full max-w-md space-y-2">
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {runningStageLabel} progress: {progress.done} / {progress.total}
            </p>
          </div>
        )}
      </div>

      <div className="space-y-6">
          {pipelineOutcome && (
            <PipelineOutcomeBanner
              outcome={pipelineOutcome}
              onReset={() => resetPanelState({ scroll: true })}
            />
          )}

          {isCachedRun ? (
            <PipelineCacheHitBanner
              cacheSourceCreatedAt={cacheSourceCreatedAt}
              onRunAgain={() => {
                idempotencyKeyRef.current = crypto.randomUUID();
                void onSubmit({ force: true });
              }}
            />
          ) : null}

          {(stage1Vote ||
            stage2Vote ||
            stage1Status !== "idle" ||
            stage2Status !== "idle" ||
            stage3Status !== "idle") && (
            <div className="grid gap-4 lg:grid-cols-3">
              <Card className="border-border/80">
                <CardHeader>
                  <CardTitle className="text-base">Stage 1 result</CardTitle>
                  <CardDescription>
                    {stage1Vote
                      ? `Fecal votes: ${stage1Vote.positiveVotes} · Non fecal votes: ${stage1Vote.negativeVotes}`
                      : "Waiting for Stage 1 output."}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-lg font-semibold">{stage1ResultLabel}</p>
                </CardContent>
              </Card>
              <Card className="border-border/80">
                <CardHeader>
                  <CardTitle className="text-base">Stage 2 result</CardTitle>
                  <CardDescription>
                    {stage2Vote
                      ? `Helminth votes: ${stage2Vote.positiveVotes} · Non Helminth votes: ${stage2Vote.negativeVotes}`
                      : "Runs only when Stage 1 result is fecal."}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-lg font-semibold">{stage2ResultLabel}</p>
                </CardContent>
              </Card>
              <Card className="border-border/80">
                <CardHeader>
                  <CardTitle className="text-base">Stage 3 result</CardTitle>
                  <CardDescription>
                    Bounding box species detection when Stage 2 is helminth positive.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-lg font-semibold">{stage3ResultLabel}</p>
                </CardContent>
              </Card>
            </div>
          )}

          {isCachedRun && !explanationsStarted ? (
            <GenerateExplanationsCard
              busy={explanationsStarting}
              onStart={() => void startExplanations()}
            />
          ) : (
            <>
              <StageGradcamGrid
                stageLabel="Stage 1"
                modelFilenames={STAGE1_MODEL_FILENAMES}
                shortName={shortModelName}
                phase={gradcamPanel.phase}
                connectionError={gradcamPanel.connectionError}
                byModel={gradcamPanel.byModel}
              />

              {(stage1JobId || limeHistory.length > 0) && (
                <StageLimeCard
                  stageLabel="Stage 1"
                  modelFilenames={STAGE1_MODEL_FILENAMES}
                  shortName={shortModelName}
                  disabled={!stage1JobId || stage1Status === "active"}
                  disabledReason={
                    stage1Status === "active"
                      ? "LIME is available after Stage 1 finishes."
                      : !stage1JobId
                        ? isCachedRun
                          ? "Generate explanations first to enable LIME."
                          : "Run a prediction first to enable LIME."
                        : undefined
                  }
                  busy={limeBusy}
                  history={limeHistory}
                  onRun={runLime}
                />
              )}

              <StageGradcamGrid
                stageLabel="Stage 2"
                modelFilenames={STAGE2_MODEL_FILENAMES}
                shortName={shortModelName}
                phase={stage2GradcamPanel.phase}
                connectionError={stage2GradcamPanel.connectionError}
                byModel={stage2GradcamPanel.byModel}
              />

              {(stage2JobId || stage2LimeHistory.length > 0) && (
                <StageLimeCard
                  stageLabel="Stage 2"
                  modelFilenames={STAGE2_MODEL_FILENAMES}
                  shortName={shortModelName}
                  disabled={!stage2JobId || stage2Status === "active"}
                  disabledReason={
                    stage2Status === "active"
                      ? "LIME is available after Stage 2 finishes."
                      : !stage2JobId
                        ? isCachedRun
                          ? "Generate explanations first to enable Stage 2 LIME."
                          : "Stage 2 LIME unlocks after Stage 2 starts."
                        : undefined
                  }
                  busy={stage2LimeBusy}
                  history={stage2LimeHistory}
                  onRun={runStage2Lime}
                />
              )}

              {STAGE3_LIME_UI_ENABLED &&
                (stage3JobId || stage3LimeHistory.length > 0) && (
                  <StageLimeCard
                    stageLabel="Stage 3"
                    modelFilenames={STAGE3_MODEL_FILENAMES}
                    shortName={shortModelName}
                    disabled={!stage3JobId || stage3Status === "active"}
                    disabledReason={
                      stage3Status === "active"
                        ? "LIME is available after Stage 3 finishes."
                        : !stage3JobId
                          ? "Stage 3 LIME unlocks after species detection starts."
                          : undefined
                    }
                    busy={stage3LimeBusy}
                    history={stage3LimeHistory}
                    onRun={runStage3Lime}
                    fixedModelFilename={stage3ModelFilename}
                    fixedModelLabel={getStage3ModelLabel(stage3ModelFilename)}
                  />
                )}
            </>
          )}

          {activity.length > 0 && (
            <Card className="border-border/80">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Clock3 className="size-4 text-muted-foreground" aria-hidden />
                  Live activity feed
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {activity.slice(0, 20).map((entry) => (
                  <div
                    key={entry.id}
                    className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-sm"
                  >
                    <p className="font-medium">
                      Stage {entry.stage} · {shortModelName(entry.modelFilename)}
                    </p>
                    {entry.error ? (
                      <p className="text-destructive">{entry.error}</p>
                    ) : (
                      <p className="text-muted-foreground">
                        {entry.detail
                          ? `${entry.detail}${
                              entry.confidencePct !== null
                                ? ` · confidence ${entry.confidencePct.toFixed(1)}%`
                                : ""
                            }`
                          : `${classLabel(entry.stage, entry.predictedClass)}${
                              entry.confidencePct !== null
                                ? ` · confidence ${entry.confidencePct.toFixed(1)}%`
                                : ""
                            }`}
                      </p>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {(previewLoading || previewError || localImageUrl) &&
            (stage3Status === "active" || stage3Status === "complete") && (
              <Card className="border-border/80">
                <CardHeader>
                  <CardTitle className="text-base">Stage 3 · species on slide</CardTitle>
                  <CardDescription>
                    Each box is numbered; colors follow species class (same class =
                    same color). The key matches the number on the image.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {previewLoading ? (
                    <div role="status" aria-live="polite" className="space-y-2">
                      <Skeleton className="h-[min(40vh,320px)] w-full rounded-lg" />
                      <p className="sr-only">Loading image preview…</p>
                    </div>
                  ) : previewError ? (
                    <p className="text-sm text-muted-foreground" role="status">
                      Preview unavailable: {previewError}
                    </p>
                  ) : localImageUrl ? (
                  <DetectionImagePreview
                    objectUrl={localImageUrl}
                    items={detectionOverlayItems}
                    boxSourceWidth={boxSourceSize?.width}
                    boxSourceHeight={boxSourceSize?.height}
                    boxCoordinateMeta={boxCoordinateMeta}
                  />
                  ) : null}
                  {stage3Status === "complete" && detectionOverlayItems.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No objects above the model confidence threshold.
                    </p>
                  ) : null}
                  {detectionOverlayItems.length > 0 ? (
                    <div className="space-y-2">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Legend (matches numbers on boxes)
                      </p>
                      <ul className="space-y-1.5 text-sm">
                        {detectionOverlayItems.map((d) => {
                          const col = getDetectionPaletteEntryForClass(
                            d.classId,
                            d.className,
                          );
                          return (
                            <li
                              key={d.id}
                              className="flex flex-wrap items-center gap-2 rounded-md border border-border/50 bg-muted/15 px-2 py-1.5"
                            >
                              <span
                                className="flex size-7 shrink-0 items-center justify-center rounded border-2 font-mono text-xs font-bold text-white"
                                style={{
                                  borderColor: col.border,
                                  backgroundColor: col.badge,
                                }}
                                title={`Box ${d.legendKey}`}
                              >
                                {d.legendKey}
                              </span>
                              <span className="min-w-0 flex-1 font-medium text-foreground">
                                {d.className}
                              </span>
                              <span className="text-muted-foreground">
                                {(d.confidence <= 1
                                  ? (d.confidence * 100).toFixed(1)
                                  : d.confidence.toFixed(1))}
                                % · {shortModelName(d.modelFilename)}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            )}

          {preview && (preview.results.length > 0 || preview.errors.length > 0) && (
            <Card className="border-border/80">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <CheckCircle2 className="size-4 text-emerald-600" aria-hidden />
                  Latest stage results
                </CardTitle>
                <CardDescription>
                  Live model outputs translated into user friendly labels.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {(preview.results as Array<Record<string, unknown>>).map((row, i) => {
                  const fn = String(row.modelFilename ?? "");
                  const pred = row.prediction as
                    | {
                        predictions?: Array<{
                          class_id?: unknown;
                          class_name?: string;
                          confidence?: number;
                          box?: number[];
                        }>;
                      }
                    | undefined;
                  if (pred && typeof pred === "object" && "predictions" in pred) {
                    const list = pred.predictions;
                    if (Array.isArray(list) && list.length > 0) {
                      const legendBase = countPredictionsBeforeRow(preview.results, i);
                      return (
                        <div
                          key={`${fn}-det-${i}`}
                          className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-sm"
                        >
                          <p className="font-medium">{shortModelName(fn)}</p>
                          <ul className="mt-1 space-y-1.5 text-muted-foreground">
                            {list.map((p, j) => {
                              const item = detectionOverlayItems[legendBase + j];
                              const col = item
                                ? getDetectionPaletteEntryForClass(
                                    item.classId,
                                    item.className,
                                  )
                                : getDetectionPaletteEntryForClass(
                                    typeof p.class_id === "number"
                                      ? p.class_id
                                      : undefined,
                                    String(p.class_name ?? ""),
                                  );
                              const boxKey = item?.legendKey ?? String(legendBase + j + 1);
                              return (
                                <li key={j} className="flex items-center gap-2">
                                  <span
                                    className="flex size-6 shrink-0 items-center justify-center rounded border-2 font-mono text-[10px] font-bold text-white"
                                    style={{
                                      borderColor: col.border,
                                      backgroundColor: col.badge,
                                    }}
                                  >
                                    {boxKey}
                                  </span>
                                  <span>
                                    <span className="font-medium text-foreground">
                                      {String(p.class_name ?? "…")}
                                    </span>
                                    {typeof p.confidence === "number"
                                      ? ` · ${(p.confidence <= 1 ? p.confidence * 100 : p.confidence).toFixed(1)}%`
                                      : ""}
                                  </span>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      );
                    }
                    return (
                      <div
                        key={`${fn}-det-${i}`}
                        className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-sm"
                      >
                        <p className="font-medium">{shortModelName(fn)}</p>
                        <p className="text-muted-foreground">No detections in this result.</p>
                      </div>
                    );
                  }
                  const cls = row.classification as Record<string, unknown> | undefined;
                  const predictedClass =
                    typeof cls?.predicted_class === "number" ? cls.predicted_class : null;
                  const classProbabilities =
                    cls?.class_probabilities && typeof cls.class_probabilities === "object"
                      ? (cls.class_probabilities as Record<string, number>)
                      : undefined;
                  const confidence = toConfidencePercent({
                    predicted_class: predictedClass ?? undefined,
                    max_prob: typeof cls?.max_prob === "number" ? cls.max_prob : undefined,
                    class_probabilities: classProbabilities,
                  });
                  return (
                    <div
                      key={`${fn}-${i}`}
                      className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-sm"
                    >
                      <p className="font-medium">{shortModelName(fn)}</p>
                      <p className="text-muted-foreground">
                        Result:{" "}
                        <span className="font-medium text-foreground">
                          {classLabel(currentStageRef.current ?? 1, predictedClass)}
                        </span>
                        {" · "}
                        Confidence:{" "}
                        <span className="font-medium text-foreground">
                          {confidence !== null ? `${confidence.toFixed(1)}%` : "…"}
                        </span>
                      </p>
                      {classProbabilities ? (
                        <p className="text-xs text-muted-foreground">
                          Class probabilities: 0={String(classProbabilities["0"] ?? "…")}
                          {" · "}1={String(classProbabilities["1"] ?? "…")}
                        </p>
                      ) : null}
                    </div>
                  );
                })}
                {(preview.errors as Array<Record<string, unknown>>).map((row, i) => (
                  <div
                    key={`err-${i}`}
                    className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
                  >
                    {String(row.modelFilename ?? "Model")}: {String(row.error ?? "Error")}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
      </div>
    </div>
  );
}
