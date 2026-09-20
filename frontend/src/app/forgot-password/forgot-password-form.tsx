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
import { ArrowLeft, KeyRound } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";
import {
  requestPasswordReset,
  type ForgotPasswordFormState,
} from "./actions";

const spring = { type: "spring" as const, stiffness: 80, damping: 18 };

export function ForgotPasswordForm() {
  const reduceMotion = useReducedMotion();
  const [state, formAction, pending] = useActionState<
    ForgotPasswordFormState,
    FormData
  >(requestPasswordReset, null);

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
            <KeyRound className="size-6 text-foreground/70" aria-hidden />
          </motion.div>
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
            animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
            transition={{ ...spring, delay: 0.2 }}
          >
            <CardTitle className="text-2xl font-semibold tracking-tight">
              Forgot password
            </CardTitle>
            <CardDescription className="mt-1.5 text-balance">
              Enter your account email. If it exists, we will send a link to
              choose a new password.
            </CardDescription>
          </motion.div>
        </CardHeader>
        <CardContent className="space-y-5">
          {state && "success" in state && state.success ? (
            <motion.p
              className="rounded-md bg-primary/10 px-3 py-2 text-sm text-foreground"
              role="status"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
            >
              Check your inbox for a reset link. You can close this tab after
              you are done.
            </motion.p>
          ) : (
            <form className="space-y-4" action={formAction}>
              <motion.div
                className="space-y-2"
                initial={reduceMotion ? false : { opacity: 0, x: -12 }}
                animate={reduceMotion ? undefined : { opacity: 1, x: 0 }}
                transition={{ ...spring, delay: 0.25 }}
              >
                <Label htmlFor="forgot-email">Email</Label>
                <Input
                  id="forgot-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@hospital.org"
                  className="h-10 transition-shadow focus:shadow-md focus:shadow-primary/5"
                  required
                />
              </motion.div>
              {state && "error" in state ? (
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
                transition={{ ...spring, delay: 0.32 }}
              >
                <Button type="submit" className="h-10 w-full" disabled={pending}>
                  {pending ? "Sending…" : "Send reset link"}
                </Button>
              </motion.div>
            </form>
          )}
        </CardContent>
        <CardFooter className="flex flex-col gap-3 border-t border-border pt-6">
          <p className="text-center text-sm text-muted-foreground">
            Remember your password?{" "}
            <Link
              href="/login"
              data-cursor-hover
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              Sign in
            </Link>
          </p>
          <Link
            href="/"
            data-cursor-hover
            className={cn(
              buttonVariants({ variant: "ghost", size: "sm" }),
              "inline-flex w-full items-center justify-center gap-1.5 text-muted-foreground",
            )}
          >
            <ArrowLeft className="size-3.5" />
            Back to home
          </Link>
        </CardFooter>
      </Card>
    </motion.div>
  );
}
