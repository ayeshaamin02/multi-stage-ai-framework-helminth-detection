import { auth } from "@/lib/auth/server";
import { NextRequest, NextResponse } from "next/server";

const runAuth = auth.middleware({ loginUrl: "/login" });

/**
 * `router.refresh()` and RSC navigations use flight headers / `_rsc` query.
 * These requests can carry only a thin cookie subset in some browsers, which
 * causes false redirects in middleware. Dashboard layout enforces auth again.
 */
function isNextRscFlightRequest(request: NextRequest): boolean {
  if (request.nextUrl.searchParams.has("_rsc")) return true;
  const accept = request.headers.get("accept") ?? "";
  if (accept.includes("text/x-component")) return true;
  return (
    request.headers.has("rsc") ||
    request.headers.has("RSC") ||
    request.headers.has("next-router-state-tree") ||
    request.headers.has("Next-Router-State-Tree") ||
    request.headers.has("next-router-prefetch") ||
    request.headers.has("next-hmr-refresh") ||
    request.headers.has("next-router-segment-prefetch")
  );
}

export async function proxy(request: NextRequest) {
  const nextActionHeader =
    request.headers.get("next-action") ??
    request.headers.get("Next-Action") ??
    "";

  const isServerAction = nextActionHeader.length > 0;
  const isFlight = isNextRscFlightRequest(request);
  const bypassNeonMiddleware =
    isFlight ||
    (request.method !== "GET" &&
      request.method !== "HEAD" &&
      isServerAction);

  if (bypassNeonMiddleware) {
    return NextResponse.next();
  }

  const reqForAuth = request.method !== "GET" && request.method !== "HEAD"
    ? new NextRequest(request.url, {
        method: "GET",
        headers: request.headers,
      })
    : request;

  return runAuth(reqForAuth);
}

export const config = {
  // Include `/dashboard` exactly; `:path*` does not match the bare path on all versions.
  matcher: ["/dashboard", "/dashboard/:path*"],
};
