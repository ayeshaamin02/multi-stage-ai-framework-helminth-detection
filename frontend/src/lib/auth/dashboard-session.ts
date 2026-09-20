import { cache } from "react";
import { getSessionInServerAction } from "@/lib/auth/route-session";

/**
 * One session resolution per RSC request for all dashboard layout + pages.
 * Avoids duplicate Neon / cookie work and reduces flaky empty sessions on navigation.
 */
export const getCachedDashboardSession = cache(getSessionInServerAction);
