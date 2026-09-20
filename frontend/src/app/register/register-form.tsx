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
import { authClient } from "@/lib/auth/client";
import { cn } from "@/lib/utils";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, CheckCircle2, Microscope } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef } from "react";
import { signUpWithEmail, type RegisterFormState } from "./actions";

const spring = { type: "spring" as const, stiffness: 80, damping: 18 };

export function RegisterForm() {
  const reduceMotion = useReducedMotion();
  const router = useRouter();
  const [state, formAction, pending] = useActionState<
    RegisterFormState,
    FormData
  >(signUpWithEmail, null);
  const redirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const success =
    state != null && "success" in state && state.success === true;

  useEffect(() => {
    if (!success) return;

    void authClient.signOut().catch(() => {});

    redirectTimerRef.current = setTimeout(() => {
      router.push("/login");
    }, 3000);

    return () => {
      if (redirectTimerRef.current) {
        clearTimeout(redirectTimerRef.current);
        redirectTimerRef.current = null;
      }
    };
  }, [success, router]);

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
            transition={{
              type: "spring",
              stiffness: 260,
              damping: 20,
              delay: 0.15,
            }}
          >
            <Microscope className="size-6 text-foreground/70" aria-hidden />
          </motion.div>
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
            animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
            transition={{ ...spring, delay: 0.2 }}
          >
            <CardTitle className="text-2xl font-semibold tracking-tight">
              Create your account
            </CardTitle>
            <CardDescription className="mt-1.5 text-balance">
              Register to access slide uploads, staged predictions, and the
              clinician dashboard.
            </CardDescription>
          </motion.div>
        </CardHeader>
        <CardContent className="space-y-5">
          {success ? (
            <motion.div
              className="flex flex-col items-center gap-3 rounded-xl border border-primary/25 bg-primary/6 px-6 py-10 text-center dark:border-primary/35 dark:bg-primary/15"
              role="status"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: "spring", stiffness: 120, damping: 18 }}
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{
                  type: "spring",
                  stiffness: 300,
                  damping: 20,
                  delay: 0.15,
                }}
              >
                <CheckCircle2
                  className="size-12 text-primary"
                  aria-hidden
                />
              </motion.div>
              <p className="text-base font-medium text-foreground">
                Account created successfully
              </p>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Redirecting you to sign in shortly. Use your new email and
                password to log in.
              </p>
              <Link
                href="/login"
                data-cursor-hover
                className="text-xs font-medium text-foreground underline-offset-4 hover:underline"
              >
                Go to sign in now
              </Link>
            </motion.div>
          ) : (
            <form className="space-y-4" action={formAction}>
              <motion.div
                className="space-y-2"
                initial={reduceMotion ? false : { opacity: 0, x: -12 }}
                animate={reduceMotion ? undefined : { opacity: 1, x: 0 }}
                transition={{ ...spring, delay: 0.25 }}
              >
                <Label htmlFor="reg-name">Full name</Label>
                <Input
                  id="reg-name"
                  name="name"
                  autoComplete="name"
                  placeholder="Dr. Jane Smith"
                  className="h-10 transition-shadow focus:shadow-md focus:shadow-primary/5"
                  required
                />
              </motion.div>
              <motion.div
                className="space-y-2"
                initial={reduceMotion ? false : { opacity: 0, x: -12 }}
                animate={reduceMotion ? undefined : { opacity: 1, x: 0 }}
                transition={{ ...spring, delay: 0.3 }}
              >
                <Label htmlFor="reg-email">Work email</Label>
                <Input
                  id="reg-email"
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
                transition={{ ...spring, delay: 0.35 }}
              >
                <Label htmlFor="reg-password">Password</Label>
                <Input
                  id="reg-password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  placeholder="••••••••"
                  className="h-10 transition-shadow focus:shadow-md focus:shadow-primary/5"
                  required
                  minLength={8}
                />
              </motion.div>
              {state != null && "error" in state ? (
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
                transition={{ ...spring, delay: 0.4 }}
              >
                <Button
                  type="submit"
                  className="h-10 w-full"
                  disabled={pending}
                >
                  {pending ? "Creating account…" : "Create account"}
                </Button>
              </motion.div>
            </form>
          )}
        </CardContent>
        <CardFooter className="flex flex-col gap-3 border-t border-border pt-6">
          {!success ? (
            <>
              <p className="text-center text-sm text-muted-foreground">
                Already registered?{" "}
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
                  "inline-flex w-full items-center justify-center gap-1.5 text-muted-foreground"
                )}
              >
                <ArrowLeft className="size-3.5" />
                Back to home
              </Link>
            </>
          ) : null}
        </CardFooter>
      </Card>
    </motion.div>
  );
}
