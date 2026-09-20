import { DashboardHero } from "@/components/dashboard/dashboard-hero";
import { PredictionDisclaimer } from "@/components/dashboard/prediction-disclaimer";
import { DashboardLiveStats } from "@/components/dashboard/dashboard-live-stats";
import { DashboardPipelineTimeline } from "@/components/dashboard/dashboard-pipeline-timeline";
import { DashboardTabs } from "@/components/dashboard/dashboard-tabs";
import type { DashboardTab } from "@/components/dashboard/dashboard-tabs";
import { HelminthPredictPanel } from "@/components/dashboard/helminth-predict-panel";
import { PredictCardStatus } from "@/components/dashboard/predict-card-status";
import { PredictionHistoryCard } from "@/components/dashboard/prediction-history-card";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getCachedDashboardSession } from "@/lib/auth/dashboard-session";
import {
  getPipelineDashboardStats,
  listPipelineHistory,
} from "@/lib/pipeline-db";
import { createPredictionApiDelegateToken } from "@/lib/prediction-api-token";
import { getStorableUserId } from "@/lib/session-user";
import { ImagePlus, Workflow } from "lucide-react";
import type { Metadata } from "next";


export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Clinician workspace for helminth microscopy detection.",
};

const HISTORY_INITIAL_LIMIT = 30;
const SEVEN_DAYS_MS = 7 * 86400000;

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab: tabQuery } = await searchParams;
  const initialTab: DashboardTab =
    tabQuery === "history" ? "history" : "predict";

  const { data: session } = await getCachedDashboardSession();
  const user = session?.user;
  const userId = user ? getStorableUserId(user) : null;

  let stats = {
    totalPredictions: 0,
    fecalDetectedStage1: 0,
    helminthPositivePhase2: 0,
    speciesDetectionsCount: 0,
  };
  let initialHistory: Awaited<ReturnType<typeof listPipelineHistory>> = [];
  let predictionApiDelegateToken: string | null = null;
  if (userId) {
    try {
      stats = await getPipelineDashboardStats(userId);
    } catch {
      /* Missing migration or DATABASE_URL */
    }
    try {
      initialHistory = await listPipelineHistory(userId, HISTORY_INITIAL_LIMIT);
    } catch {
      /* Missing migration or DATABASE_URL */
    }
    try {
      predictionApiDelegateToken = createPredictionApiDelegateToken(userId);
    } catch {
      predictionApiDelegateToken = null;
    }
  }

  // Server Component renders once per request (force-dynamic); Date.now() here
  // gives the wall-clock cutoff for "runs this week".
  // eslint-disable-next-line react-hooks/purity -- Server Component, intentional per-request value
  const sevenDaysAgo = Date.now() - SEVEN_DAYS_MS;
  const runsThisWeek = initialHistory.reduce(
    (n, r) => (new Date(r.created_at).getTime() >= sevenDaysAgo ? n + 1 : n),
    0,
  );

  return (
    <main className="flex-1 bg-muted/10">
      <div className="mx-auto max-w-6xl space-y-8 px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
        <DashboardHero userName={user?.name ?? null} runsThisWeek={runsThisWeek} />

        <PredictionDisclaimer />

        <DashboardLiveStats
          initialStats={stats}
          predictionApiDelegateToken={predictionApiDelegateToken}
        />

        {/* Pipeline strip lives ABOVE the tabs so it stays visible regardless of
            which tab is active, and shows the running stage live. */}
        <Card className="border-border/80 shadow-sm transition-shadow duration-300 hover:shadow-md">
          <CardHeader>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Workflow
                    className="size-4 text-muted-foreground"
                    aria-hidden
                  />
                  Pipeline stages
                </CardTitle>
                <CardDescription className="text-xs">
                  Live indicator follows the running stage.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <DashboardPipelineTimeline />
          </CardContent>
        </Card>

        <DashboardTabs
          initialTab={initialTab}
          predictTab={
            <Card
              id="dashboard-predict-card"
              className="scroll-mt-20 border-border/80 shadow-sm transition-shadow duration-300 hover:shadow-md"
            >
              <CardHeader>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <ImagePlus className="size-5 text-primary" />
                      Upload &amp; predict
                    </CardTitle>
                    <CardDescription>
                      Three stage pipeline with live progress, gradcam previews,
                      and saved history.
                    </CardDescription>
                  </div>
                  <PredictCardStatus className="sm:self-start" />
                </div>
              </CardHeader>
              <CardContent>
                <HelminthPredictPanel
                  predictionApiDelegateToken={predictionApiDelegateToken}
                />
              </CardContent>
            </Card>
          }
          historyTab={
            <PredictionHistoryCard
              initialHistory={initialHistory}
              predictionApiDelegateToken={predictionApiDelegateToken}
            />
          }
        />

        <p className="text-center text-xs text-muted-foreground">
          Signed in as{" "}
          <span className="font-mono text-foreground/80">{user?.email}</span>
        </p>
      </div>
    </main>
  );
}
