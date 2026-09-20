"use client";

import { buttonVariants } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import Link from "next/link";

export function SiteFooter() {
  return (
    <motion.footer
      className="border-t border-border bg-muted/30"
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5 }}
    >
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
        <div className="flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-semibold text-foreground">
              Helminth Detection
            </p>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
              Upload microscopy slides and review staged model outputs in a
              workflow built for clinicians.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/register"
              data-cursor-hover
              className={cn(buttonVariants({ size: "default" }))}
            >
              Create account
            </Link>
            <Link
              href="/login"
              data-cursor-hover
              className={cn(
                buttonVariants({ variant: "outline", size: "default" })
              )}
            >
              Sign in
            </Link>
          </div>
        </div>
        <Separator className="my-10" />
        <div className="flex flex-col gap-4 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {new Date().getFullYear()} Helminth Detection. All rights
            reserved.
          </p>
          <p className="max-w-lg sm:text-right">
            This demo does not process real patient data.
          </p>
        </div>
      </div>
    </motion.footer>
  );
}
