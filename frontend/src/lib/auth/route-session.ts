import { connection } from "next/server";
import { cookies, headers } from "next/headers";
import { jwtVerify } from "jose";
import { auth } from "@/lib/auth/server";

/** Must match @neondatabase/auth server cookie filter (see extractNeonAuthCookies). */
const NEON_AUTH_COOKIE_PREFIX = "__Secure-neon-auth";
/** Primary auth cookie (token). */
const NEON_AUTH_SESSION_TOKEN_COOKIE = `${NEON_AUTH_COOKIE_PREFIX}.session_token`;
/** Locally minted, HS256-signed JWT containing the session/user payload. */
const NEON_AUTH_SESSION_DATA_COOKIE = `${NEON_AUTH_COOKIE_PREFIX}.local.session_data`;

const NEON_AUTH_PROXY_HEADER = "x-neon-auth-proxy";

function isNeonAuthCookieName(name: string): boolean {
  return (
    name.startsWith(NEON_AUTH_COOKIE_PREFIX) ||
    name.startsWith("neon-auth.") ||
    (name.includes("neon-auth") && name.includes("session"))
  );
}

function extractNeonAuthCookieHeader(cookieHeader: string | null): string {
  if (!cookieHeader) return "";
  const parts = cookieHeader.split(";").map((p) => p.trim()).filter(Boolean);
  const kept: string[] = [];
  for (const part of parts) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const name = part.slice(0, eq).trim();
    if (isNeonAuthCookieName(name)) {
      kept.push(part);
    }
  }
  return kept.join("; ");
}

type SessionResult = Awaited<ReturnType<typeof auth.getSession>>;

function hasUser(data: SessionResult["data"]): boolean {
  const u = data && "user" in data ? data.user : null;
  return !!u && typeof u === "object";
}

/**
 * Verify the locally signed `__Secure-neon-auth.local.session_data` JWT (HS256)
 * directly using `cookies()`. The Neon SDK reads cookies from `headers()`,
 * which can return an empty snapshot during App Router RSC navigation, causing
 * false "logged out" results and bouncing the user back to `/login`. Reading
 * from `cookies()` works reliably in the same contexts.
 *
 * No network call. JWT is signed with `NEON_AUTH_COOKIE_SECRET` and validated
 * the same way the Neon SDK validates it server-side.
 */
async function getSessionFromLocalJwt(
  store: Awaited<ReturnType<typeof cookies>>,
): Promise<SessionResult | null> {
  const dataCookie = store.get(NEON_AUTH_SESSION_DATA_COOKIE);
  const tokenCookie = store.get(NEON_AUTH_SESSION_TOKEN_COOKIE);
  if (!dataCookie?.value || !tokenCookie?.value) return null;

  const secret = process.env.NEON_AUTH_COOKIE_SECRET;
  if (!secret || secret.length < 32) return null;

  try {
    const { payload } = await jwtVerify(
      dataCookie.value,
      new TextEncoder().encode(secret),
      { algorithms: ["HS256"] },
    );
    if (
      payload &&
      typeof payload === "object" &&
      "user" in payload &&
      payload.user &&
      typeof payload.user === "object" &&
      "session" in payload &&
      payload.session &&
      typeof payload.session === "object"
    ) {
      return {
        data: payload as unknown as NonNullable<SessionResult["data"]>,
        error: null,
      };
    }
  } catch {
    /* invalid or expired JWT — fall through */
  }
  return null;
}

async function fetchSessionFromNeonServer(
  fromSdk: SessionResult,
  neonCookies: string,
  origin: string,
): Promise<SessionResult> {
  const base = process.env.NEON_AUTH_BASE_URL?.replace(/\/$/, "");
  if (!base) {
    return fromSdk;
  }

  try {
    const res = await fetch(`${base}/get-session`, {
      method: "GET",
      headers: {
        Cookie: neonCookies,
        Origin: origin,
        [NEON_AUTH_PROXY_HEADER]: "nextjs",
      },
      cache: "no-store",
    });

    if (!res.ok) {
      return fromSdk;
    }

    const body = (await res.json()) as Record<string, unknown>;
    const nested =
      body &&
      typeof body === "object" &&
      "data" in body &&
      body.data &&
      typeof body.data === "object"
        ? (body.data as Record<string, unknown>)
        : null;
    const payload =
      body && "user" in body && "session" in body
        ? body
        : nested && "user" in nested && "session" in nested
          ? nested
          : null;

    if (
      payload &&
      payload.user &&
      typeof payload.user === "object" &&
      payload.session &&
      typeof payload.session === "object"
    ) {
      return {
        data: payload as NonNullable<SessionResult["data"]>,
        error: null,
      };
    }
  } catch {
    /* keep SDK result */
  }

  return fromSdk;
}

/**
 * Neon Auth's `getSession()` uses `headers()` from `next/headers`. In App Router
 * POST/GET handlers that snapshot can be empty even when the browser sent
 * `Cookie` on the real `Request`. We fall back to calling the Auth server's
 * `get-session` with cookies taken from `request.headers`.
 */
export async function getSessionInApiRoute(
  request: Request,
): Promise<SessionResult> {
  await connection();

  const fromSdk = await auth.getSession();
  if (hasUser(fromSdk.data)) {
    return fromSdk;
  }

  // Robust path: validate the signed session_data JWT directly from the cookies
  // jar. No upstream call required and resilient to empty `headers()` snapshots.
  const store = await cookies();
  const fromJwt = await getSessionFromLocalJwt(store);
  if (fromJwt && hasUser(fromJwt.data)) {
    return fromJwt;
  }

  // Last resort: upstream get-session with cookies sourced from the live request.
  const raw = request.headers.get("cookie");
  const neonCookies = extractNeonAuthCookieHeader(raw);
  if (!neonCookies) {
    return fromSdk;
  }

  const origin =
    request.headers.get("origin") ||
    request.headers.get("referer")?.split("/").slice(0, 3).join("/") ||
    new URL(request.url).origin;

  return fetchSessionFromNeonServer(fromSdk, neonCookies, origin);
}

/**
 * Same empty / partial `Cookie` snapshot as API routes: Server Actions, RSC
 * navigation (`/dashboard/history` from `/dashboard`), and some POSTs only see
 * a thin header (e.g. HMR) while `cookies()` still has the full jar — verify
 * the signed session_data JWT directly from the jar before falling back to
 * an upstream request.
 */
export async function getSessionInServerAction(): Promise<SessionResult> {
  await connection();

  const fromSdk = await auth.getSession();
  if (hasUser(fromSdk.data)) {
    return fromSdk;
  }

  // Robust path: validate the signed session_data JWT directly from the cookies
  // jar. This is what was missing — the SDK reads cookies from `headers()`
  // which is intermittently empty during RSC navigation, so it returned no
  // user even when the browser still had a valid session cookie.
  const store = await cookies();
  const fromJwt = await getSessionFromLocalJwt(store);
  if (fromJwt && hasUser(fromJwt.data)) {
    return fromJwt;
  }

  // Last resort: upstream get-session using cookies from the jar (handles the
  // case where the locally cached JWT has expired but the session token has not).
  const all = store.getAll();
  if (all.length === 0) {
    return fromSdk;
  }
  const raw = all.map((c) => `${c.name}=${c.value}`).join("; ");
  const neonCookies = extractNeonAuthCookieHeader(raw);
  if (!neonCookies) {
    return fromSdk;
  }

  const h = await headers();
  const origin =
    h.get("origin") ||
    h.get("referer")?.split("/").slice(0, 3).join("/") ||
    "";

  return fetchSessionFromNeonServer(fromSdk, neonCookies, origin);
}
