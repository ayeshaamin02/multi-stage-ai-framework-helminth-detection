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
import { ArrowLeft, Microscope } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";
import { signInWithEmail, type AuthFormState } from "./actions";

const spring = { type: "spring" as const, stiffness: 80, damping: 18 };

export function LoginForm({ resetSuccess = false }: { resetSuccess?: boolean }) {
  const reduceMotion = useReducedMotion();
  const [state, formAction, pending] = useActionState<
    AuthFormState,
    FormData
  >(signInWithEmail, null);

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
            <Microscope className="size-6 text-foreground/70" aria-hidden />
          </motion.div>
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
            animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
            transition={{ ...spring, delay: 0.2 }}
          >
            <CardTitle className="text-2xl font-semibold tracking-tight">
              Welcome back
            </CardTitle>
            <CardDescription className="mt-1.5 text-balance">
              Sign in to open your clinician dashboard and prediction workflow.
            </CardDescription>
          </motion.div>
        </CardHeader>
        <CardContent className="space-y-5">
          {resetSuccess ? (
            <motion.p
              className="rounded-md bg-primary/10 px-3 py-2 text-sm text-foreground"
              role="status"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
            >
              Your password was updated. Sign in with your new password.
            </motion.p>
          ) : null}
          <form className="space-y-4" action={formAction}>
            <motion.div
              className="space-y-2"
              initial={reduceMotion ? false : { opacity: 0, x: -12 }}
              animate={reduceMotion ? undefined : { opacity: 1, x: 0 }}
              transition={{ ...spring, delay: 0.25 }}
            >
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="you@hospital.org"
                className="h-10 transition-shadow focus:shadow-md focus:shadow-primary/5"
                required
              />
            </motion.div>
            <motion.div
              className="space-y-2"
              initial={reduceMotion ? false : { opacity: 0, x: -12 }}
              animate={reduceMotion ? undefined : { opacity: 1, x: 0 }}
              transition={{ ...spring, delay: 0.32 }}
            >
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="password">Password</Label>
                <Link
                  href="/forgot-password"
                  data-cursor-hover
                  className="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                >
                  Forgot password?
                </Link>
              </div>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                className="h-10 transition-shadow focus:shadow-md focus:shadow-primary/5"
                required
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
              transition={{ ...spring, delay: 0.38 }}
            >
              <Button type="submit" className="h-10 w-full" disabled={pending}>
                {pending ? "Signing in…" : "Sign in"}
              </Button>
            </motion.div>
          </form>
        </CardContent>
        <CardFooter className="flex flex-col gap-3 border-t border-border pt-6">
          <p className="text-center text-sm text-muted-foreground">
            No account?{" "}
            <Link
              href="/register"
              data-cursor-hover
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              Register
            </Link>
          </p>
          <Link
            href="/"
            data-cursor-hover
            className={cn(
              buttonVariants({ variant: "ghost", size: "sm" }),
              "inline-flex w-full items-center justify-center gap-1.5 text-muted-foreground"
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
