"use server";

import { revalidatePath } from "next/cache";
import { getSessionInServerAction } from "@/lib/auth/route-session";
import {
  serviceFinalizeHelminthRun,
  serviceListHelminthHistory,
  serviceSubmitHelminthBatch,
  serviceSyncHelminthRun,
} from "@/lib/server/helminth-run-service";
import { getStorableUserId } from "@/lib/session-user";

async function requireUserId(): Promise<
  { ok: true; userId: string } | { ok: false; error: string }
> {
  const { data: authPayload } = await getSessionInServerAction();
  const user = authPayload && "user" in authPayload ? authPayload.user : null;
  if (!user || typeof user !== "object") {
    return { ok: false, error: "Unauthorized" };
  }
  const userId = getStorableUserId(user);
  if (!userId) {
    return { ok: false, error: "Unauthorized" };
  }
  return { ok: true, userId };
}

/** Prefer this over fetch('/api/...') so Safari sends session via Server Action POST. */
export async function submitHelminthScreeningAction(formData: FormData) {
  const authz = await requireUserId();
  if (!authz.ok) return { ok: false as const, error: authz.error };

  const file = formData.get("image");
  if (!file || !(file instanceof File)) {
    return { ok: false as const, error: "Missing image file." };
  }

  const result = await serviceSubmitHelminthBatch(authz.userId, file);
  if (result.ok) {
    revalidatePath("/dashboard");
  }
  return result;
}

export async function finalizeHelminthRunAction(runId: string) {
  const authz = await requireUserId();
  if (!authz.ok) return { ok: false as const, error: authz.error };

  const result = await serviceFinalizeHelminthRun(authz.userId, runId);
  if (result.ok) {
    revalidatePath("/dashboard");
  }
  return result;
}

export async function syncHelminthRunAction(runId: string) {
  const authz = await requireUserId();
  if (!authz.ok) return { ok: false as const, error: authz.error };

  return serviceSyncHelminthRun(authz.userId, runId);
}

export async function listHelminthHistoryAction() {
  const authz = await requireUserId();
  if (!authz.ok) return { ok: false as const, error: authz.error };

  return serviceListHelminthHistory(authz.userId, 50);
}
