import { createHmac, timingSafeEqual } from "crypto";

const PURPOSE = "helminth-pred-api";
const TTL_MS = 15 * 60 * 1000;

function getSecret(): string {
  const s = process.env.NEON_AUTH_COOKIE_SECRET;
  if (!s || s.length < 32) {
    throw new Error("NEON_AUTH_COOKIE_SECRET must be set (min 32 chars).");
  }
  return s;
}

/** Minted on the dashboard (RSC); sent on prediction API fetch when cookies are not. */
export function createPredictionApiDelegateToken(userId: string): string {
  const exp = Date.now() + TTL_MS;
  const payload = Buffer.from(
    JSON.stringify({ p: PURPOSE, sub: userId, exp }),
    "utf8",
  ).toString("base64url");
  const sig = createHmac("sha256", getSecret())
    .update(payload)
    .digest("base64url");
  return `${payload}.${sig}`;
}

export function verifyPredictionApiDelegateToken(
  token: string,
): { userId: string } | null {
  const i = token.lastIndexOf(".");
  if (i === -1) return null;
  const payloadB64 = token.slice(0, i);
  const sig = token.slice(i + 1);
  let expected: string;
  try {
    expected = createHmac("sha256", getSecret())
      .update(payloadB64)
      .digest("base64url");
  } catch {
    return null;
  }
  try {
    if (
      sig.length !== expected.length ||
      !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
    ) {
      return null;
    }
  } catch {
    return null;
  }
  let parsed: { p?: string; sub?: string; exp?: number };
  try {
    parsed = JSON.parse(
      Buffer.from(payloadB64, "base64url").toString("utf8"),
    ) as { p?: string; sub?: string; exp?: number };
  } catch {
    return null;
  }
  if (parsed.p !== PURPOSE || typeof parsed.sub !== "string" || !parsed.sub) {
    return null;
  }
  if (typeof parsed.exp !== "number" || parsed.exp < Date.now()) {
    return null;
  }
  return { userId: parsed.sub };
}
