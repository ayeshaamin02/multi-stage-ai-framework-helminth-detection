import { headers } from "next/headers";

/**
 * Public origin for absolute URLs (e.g. password-reset redirectTo).
 * Prefer request headers; fall back to env when Host is missing.
 */
export async function getAppOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (host) {
    const forwarded = h.get("x-forwarded-proto");
    const proto =
      forwarded ??
      (host.startsWith("localhost") || host.startsWith("127.0.0.1")
        ? "http"
        : "https");
    return `${proto}://${host}`;
  }

  const fromPublic = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (fromPublic) return fromPublic;

  const vercel = process.env.VERCEL_URL?.replace(/\/$/, "");
  if (vercel) return vercel.startsWith("http") ? vercel : `https://${vercel}`;

  throw new Error(
    "Cannot resolve public site URL. Set NEXT_PUBLIC_SITE_URL or open this action from a normal HTTP request.",
  );
}
