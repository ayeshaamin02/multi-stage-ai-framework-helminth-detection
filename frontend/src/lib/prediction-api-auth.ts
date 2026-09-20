import { getSessionInApiRoute } from "@/lib/auth/route-session";
import { verifyPredictionApiDelegateToken } from "@/lib/prediction-api-token";
import { getStorableUserId } from "@/lib/session-user";

export type PredictionAuthSource = "cookie" | "bearer" | "none";

/**
 * Session cookie (when the browser sends it) or Bearer delegate token from RSC.
 */
export async function resolvePredictionUserId(request: Request): Promise<{
  userId: string | null;
  authSource: PredictionAuthSource;
}> {
  const { data: session } = await getSessionInApiRoute(request);
  if (session?.user) {
    const id = getStorableUserId(session.user);
    if (id) return { userId: id, authSource: "cookie" };
  }

  const auth = request.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    const v = verifyPredictionApiDelegateToken(auth.slice(7).trim());
    if (v?.userId) return { userId: v.userId, authSource: "bearer" };
  }

  return { userId: null, authSource: "none" };
}
