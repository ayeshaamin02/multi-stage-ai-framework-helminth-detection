"use server";

import { auth } from "@/lib/auth/server";
import { redirect } from "next/navigation";

export type AuthFormState = { error: string } | null;

export async function signInWithEmail(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = (formData.get("email") as string)?.trim();
  const password = formData.get("password") as string;

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  const { error } = await auth.signIn.email({ email, password });

  if (error) {
    return { error: error.message || "Could not sign in. Try again." };
  }

  redirect("/dashboard");
}
