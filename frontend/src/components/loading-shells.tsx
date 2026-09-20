import { Skeleton } from "@/components/ui/skeleton";

export function MarketingShellSkeleton() {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-transparent sm:border-border">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:h-16 sm:px-6 lg:px-8">
          <Skeleton className="h-5 w-44 sm:w-52" />
          <div className="hidden items-center gap-8 md:flex">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-14" />
            <Skeleton className="h-4 w-12" />
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <Skeleton className="hidden h-8 w-14 sm:block" />
            <Skeleton className="hidden h-8 w-20 sm:block" />
            <Skeleton className="h-8 w-8 rounded-lg md:hidden" />
          </div>
        </div>
      </header>
      <main className="flex flex-1 flex-col">
        <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="mt-6 h-10 w-full max-w-md" />
          <Skeleton className="mt-4 h-4 w-full max-w-xl" />
          <Skeleton className="mt-2 h-4 w-full max-w-lg" />
          <div className="mt-10 flex flex-wrap gap-3">
            <Skeleton className="h-11 w-36 rounded-lg" />
            <Skeleton className="h-11 w-24 rounded-lg" />
            <Skeleton className="h-11 w-28 rounded-lg" />
          </div>
          <div className="mt-24 space-y-4 border-y border-border py-16">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-8 w-2/3 max-w-lg" />
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-36 rounded-xl" />
              ))}
            </div>
          </div>
        </div>
      </main>
      <footer className="border-t border-border bg-muted/30">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div className="space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-full max-w-sm" />
              <Skeleton className="h-3 w-full max-w-xs" />
            </div>
            <div className="flex flex-wrap gap-3">
              <Skeleton className="h-9 w-28 rounded-lg" />
              <Skeleton className="h-9 w-20 rounded-lg" />
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

export function AuthPageSkeleton() {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-transparent sm:border-border">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:h-16 sm:px-6 lg:px-8">
          <Skeleton className="h-5 w-44 sm:w-52" />
          <div className="hidden items-center gap-8 md:flex">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-14" />
            <Skeleton className="h-4 w-12" />
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <Skeleton className="hidden h-8 w-14 sm:block" />
            <Skeleton className="hidden h-8 w-20 sm:block" />
            <Skeleton className="h-8 w-8 rounded-lg md:hidden" />
          </div>
        </div>
      </header>
      <main className="relative flex flex-1 items-center justify-center px-4 py-16 sm:px-6">
        <div className="w-full max-w-md space-y-6 rounded-xl border border-border bg-card p-6 shadow-sm sm:p-8">
          <div className="space-y-2 text-center">
            <Skeleton className="mx-auto h-8 w-3/4 max-w-xs" />
            <Skeleton className="mx-auto h-4 w-full" />
            <Skeleton className="mx-auto h-4 w-4/5" />
          </div>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-10 w-full rounded-lg" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-3 w-14" />
              <Skeleton className="h-10 w-full rounded-lg" />
            </div>
            <Skeleton className="h-10 w-full rounded-lg" />
          </div>
        </div>
      </main>
      <footer className="border-t border-border bg-muted/30">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
          <Skeleton className="h-3 w-56" />
        </div>
      </footer>
    </div>
  );
}

export function DashboardPageSkeleton() {
  return (
    <main className="flex-1 bg-muted/10">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
        <div className="pb-8">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="mt-3 h-9 w-64 max-w-full sm:h-10" />
          <Skeleton className="mt-3 h-4 w-full max-w-2xl" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl border border-border/80 bg-card p-4 shadow-sm"
            >
              <div className="flex items-start justify-between">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="size-8 rounded-lg" />
              </div>
              <Skeleton className="mt-4 h-9 w-16" />
              <Skeleton className="mt-2 h-3 w-24" />
            </div>
          ))}
        </div>
        <div className="mt-8 grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <div className="rounded-xl border border-border/80 bg-card p-6 shadow-sm">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="mt-2 h-4 w-full max-w-md" />
              <Skeleton className="mt-8 h-48 w-full rounded-xl" />
            </div>
          </div>
          <div className="rounded-xl border border-border/80 bg-card p-6 shadow-sm">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="mt-2 h-4 w-full" />
            <div className="mt-6 space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-xl" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
