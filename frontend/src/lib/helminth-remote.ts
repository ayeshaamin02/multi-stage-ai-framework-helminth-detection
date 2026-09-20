import { getStage1ApiBaseUrl } from "@/lib/helminth-config";

export type HelminthStatusPayload = {
  status: string;
  total_models?: number;
  completed_models?: number;
  results?: unknown[];
  errors?: unknown[];
};

export async function fetchRemoteJobStatus(
  apiBaseUrl: string,
  externalJobId: string,
): Promise<HelminthStatusPayload> {
  const base = apiBaseUrl.replace(/\/$/, "");
  const res = await fetch(`${base}/predict/status/${externalJobId}`, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Remote status HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  return (await res.json()) as HelminthStatusPayload;
}

export async function fetchHelminthJobStatus(
  externalJobId: string,
): Promise<HelminthStatusPayload> {
  return fetchRemoteJobStatus(getStage1ApiBaseUrl(), externalJobId);
}
