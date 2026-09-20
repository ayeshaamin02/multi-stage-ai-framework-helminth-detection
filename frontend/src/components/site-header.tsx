"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { authClient } from "@/lib/auth/client";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { LayoutDashboard, Menu } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

const nav = [
  { href: "/#workflow", label: "Pipeline" },
  { href: "/models", label: "Models" },
  { href: "/learn", label: "Learn" },
] as const;

export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const signedIn = Boolean(session?.user);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <motion.header
      className={cn(
        "sticky top-0 z-50 border-b transition-[background-color,border-color,backdrop-filter] duration-300",
        scrolled
          ? "border-border bg-background/75 backdrop-blur-md supports-backdrop-filter:bg-background/60"
          : "border-transparent bg-transparent"
      )}
      initial={{ y: -8, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:h-16 sm:px-6 lg:px-8">
        <Link
          href="/"
          data-cursor-hover
          className="text-sm font-semibold tracking-tight text-foreground transition-opacity hover:opacity-80"
        >
          Helminth Detection
        </Link>

        <nav
          className="hidden items-center gap-8 text-sm md:flex"
          aria-label="Primary"
        >
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              data-cursor-hover
              className="link-animated text-foreground transition-opacity hover:opacity-85"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          {sessionPending ? (
            <Skeleton className="hidden h-8 w-24 rounded-md sm:inline-block" />
          ) : signedIn ? (
            <Link
              href="/dashboard"
              data-cursor-hover
              className={cn(
                buttonVariants({ variant: "default", size: "sm" }),
                "hidden gap-1.5 sm:inline-flex"
              )}
            >
              <LayoutDashboard className="size-4" />
              Dashboard
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                data-cursor-hover
                className={cn(
                  buttonVariants({ variant: "ghost", size: "sm" }),
                  "hidden sm:inline-flex"
                )}
              >
                Login
              </Link>
              <Link
                href="/register"
                data-cursor-hover
                className={cn(
                  buttonVariants({ variant: "default", size: "sm" }),
                  "hidden sm:inline-flex"
                )}
              >
                Register
              </Link>
            </>
          )}

          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              className="text-foreground md:hidden [&_svg]:text-primary"
              data-cursor-hover
              onClick={() => setMenuOpen(true)}
              aria-expanded={menuOpen}
              aria-controls="mobile-nav"
            >
              <Menu className="size-4" />
              <span className="sr-only">Open menu</span>
            </Button>
            <SheetContent
              id="mobile-nav"
              side="right"
              className="w-[min(100%,320px)]"
            >
              <SheetHeader>
                <SheetTitle>Menu</SheetTitle>
              </SheetHeader>
              <nav className="mt-8 flex flex-col gap-1" aria-label="Mobile">
                {nav.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    data-cursor-hover
                    className="rounded-lg px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                    onClick={() => setMenuOpen(false)}
                  >
                    {item.label}
                  </Link>
                ))}
                <div className="my-4 h-px bg-border" role="separator" />
                {signedIn ? (
                  <Link
                    href="/dashboard"
                    data-cursor-hover
                    className={cn(
                      buttonVariants({ variant: "default", size: "default" }),
                      "w-full justify-center gap-2"
                    )}
                    onClick={() => setMenuOpen(false)}
                  >
                    <LayoutDashboard className="size-4" />
                    Dashboard
                  </Link>
                ) : (
                  <>
                    <Link
                      href="/login"
                      data-cursor-hover
                      className={cn(
                        buttonVariants({ variant: "outline", size: "default" }),
                        "w-full justify-center"
                      )}
                      onClick={() => setMenuOpen(false)}
                    >
                      Login
                    </Link>
                    <Link
                      href="/register"
                      data-cursor-hover
                      className={cn(
                        buttonVariants({ variant: "default", size: "default" }),
                        "mt-2 w-full justify-center"
                      )}
                      onClick={() => setMenuOpen(false)}
                    >
                      Register
                    </Link>
                  </>
                )}
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </motion.header>
  );
}
