import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardHistoryRunLoading() {
  return (
    <main className="flex-1 bg-muted/10">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
        <Skeleton className="h-9 w-36" />
        <div className="mt-6 space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-8 w-72" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
        <Skeleton className="mt-8 h-[320px] w-full rounded-lg" />
      </div>
    </main>
  );
}
