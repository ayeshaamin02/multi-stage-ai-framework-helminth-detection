import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * The history view now lives as a tab on /dashboard so an in-progress prediction
 * stays mounted while the user peeks at history. Direct links to /dashboard/history
 * still work — they just land on the History tab.
 */
export default function DashboardHistoryRedirect() {
  redirect("/dashboard?tab=history");
}
