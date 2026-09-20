import { DashboardSignOut } from "@/components/dashboard-sign-out";
import { cn } from "@/lib/utils";
import { Home, Microscope } from "lucide-react";
import Link from "next/link";

type DashboardHeaderProps = {
  user: {
    name: string;
    email: string;
  };
};

export function DashboardHeader({ user }: DashboardHeaderProps) {
  return (
    <header
      className={cn(
        "sticky top-0 z-50 border-b border-border",
        "bg-background/90 backdrop-blur-md supports-backdrop-filter:bg-background/75",
      )}
    >
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:h-16 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/dashboard"
            className="flex min-w-0 items-center gap-2 text-sm font-semibold tracking-tight text-foreground transition-opacity hover:opacity-80"
          >
            <Microscope className="size-5 shrink-0 text-primary" aria-hidden />
            <span className="truncate">Helminth Detection</span>
          </Link>
          <span
            className="hidden shrink-0 rounded-md bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground sm:inline"
            aria-hidden
          >
            Dashboard
          </span>
        </div>

        <nav
          className="flex shrink-0 items-center gap-2 sm:gap-4"
          aria-label="Dashboard"
        >
          <Link
            href="/"
            className="inline-flex min-h-9 min-w-9 items-center justify-center gap-1.5 rounded-md px-2 text-sm text-foreground transition-opacity hover:opacity-80 sm:min-w-0 sm:justify-start [&_svg]:text-primary"
          >
            <Home className="size-3.5 shrink-0" aria-hidden />
            <span className="hidden sm:inline">Home</span>
          </Link>
          <span className="h-4 w-px bg-border" aria-hidden />
          <span
            className="hidden max-w-[min(180px,24vw)] truncate text-sm text-muted-foreground md:inline"
            title={user.email}
          >
            {user.name || user.email}
          </span>
          <DashboardSignOut />
        </nav>
      </div>
    </header>
  );
}
