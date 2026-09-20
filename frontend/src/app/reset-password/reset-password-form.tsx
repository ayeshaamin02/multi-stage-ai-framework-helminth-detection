"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, Lock } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useActionState } from "react";
import { resetPasswordWithToken, type ResetPasswordFormState } from "./actions";

const spring = { type: "spring" as const, stiffness: 80, damping: 18 };

export function ResetPasswordForm() {
  const reduceMotion = useReducedMotion();
  const searchParams = useSearchParams();
  const token = searchParams.get("token")?.trim() ?? "";
  const linkError = searchParams.get("error")?.toUpperCase() ?? "";
  const invalidFromAuth = linkError === "INVALID_TOKEN";

  const [state, formAction, pending] = useActionState<
    ResetPasswordFormState,
    FormData
  >(resetPasswordWithToken, null);

  const showForm = token.length > 0 && !invalidFromAuth;

  return (
    <motion.div
      className="relative z-10 w-full max-w-md"
      initial={reduceMotion ? false : { opacity: 0, y: 24, scale: 0.97 }}
      animate={reduceMotion ? undefined : { opacity: 1, y: 0, scale: 1 }}
      transition={{ ...spring, delay: 0.05 }}
    >
      <Card
        className="border-border/80 shadow-lg shadow-primary/5"
        data-cursor-hover
      >
        <CardHeader className="items-center gap-3 text-center">
          <motion.div
            className="flex size-12 items-center justify-center rounded-xl border border-border bg-muted/50"
            initial={reduceMotion ? false : { scale: 0, rotate: -20 }}
            animate={reduceMotion ? undefined : { scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 20, delay: 0.15 }}
          >
            <Lock className="size-6 text-foreground/70" aria-hidden />
          </motion.div>
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
            animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
            transition={{ ...spring, delay: 0.2 }}
          >
            <CardTitle className="text-2xl font-semibold tracking-tight">
              Set a new password
            </CardTitle>
            <CardDescription className="mt-1.5 text-balance">
              Choose a new password for your account.
            </CardDescription>
          </motion.div>
        </CardHeader>
        <CardContent className="space-y-5">
          {!showForm ? (
            <div className="space-y-4">
              <p
                className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
                role="alert"
              >
                This reset link is invalid or has expired. Request a new one
                from the sign-in page.
              </p>
              <Link
                href="/forgot-password"
                className={cn(buttonVariants(), "inline-flex h-10 w-full items-center justify-center")}
              >
                Request new link
              </Link>
            </div>
          ) : (
            <form className="space-y-4" action={formAction}>
              <input type="hidden" name="token" value={token} />
              <motion.div
                className="space-y-2"
                initial={reduceMotion ? false : { opacity: 0, x: -12 }}
                animate={reduceMotion ? undefined : { opacity: 1, x: 0 }}
                transition={{ ...spring, delay: 0.25 }}
              >
                <Label htmlFor="reset-password">New password</Label>
                <Input
                  id="reset-password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  placeholder="••••••••"
                  className="h-10 transition-shadow focus:shadow-md focus:shadow-primary/5"
                  required
                  minLength={8}
                />
              </motion.div>
              <motion.div
                className="space-y-2"
                initial={reduceMotion ? false : { opacity: 0, x: -12 }}
                animate={reduceMotion ? undefined : { opacity: 1, x: 0 }}
                transition={{ ...spring, delay: 0.3 }}
              >
                <Label htmlFor="reset-confirm">Confirm password</Label>
                <Input
                  id="reset-confirm"
                  name="confirm"
                  type="password"
                  autoComplete="new-password"
                  placeholder="••••••••"
                  className="h-10 transition-shadow focus:shadow-md focus:shadow-primary/5"
                  required
                  minLength={8}
                />
              </motion.div>
              {state?.error ? (
                <motion.p
                  className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
                  role="alert"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  {state.error}
                </motion.p>
              ) : null}
              <motion.div
                initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
                transition={{ ...spring, delay: 0.36 }}
              >
                <Button type="submit" className="h-10 w-full" disabled={pending}>
                  {pending ? "Updating…" : "Update password"}
                </Button>
              </motion.div>
            </form>
          )}
        </CardContent>
        <CardFooter className="flex flex-col gap-3 border-t border-border pt-6">
          <Link
            href="/login"
            data-cursor-hover
            className={cn(
              buttonVariants({ variant: "ghost", size: "sm" }),
              "inline-flex w-full items-center justify-center gap-1.5 text-muted-foreground",
            )}
          >
            <ArrowLeft className="size-3.5" />
            Back to sign in
          </Link>
        </CardFooter>
      </Card>
    </motion.div>
  );
}
