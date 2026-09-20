"use server";

import { auth } from "@/lib/auth/server";

export type RegisterFormState =
  | { error: string }
  | { success: true }
  | null;

export async function signUpWithEmail(
  _prev: RegisterFormState,
  formData: FormData,
): Promise<RegisterFormState> {
  const name = (formData.get("name") as string)?.trim();
  const email = (formData.get("email") as string)?.trim();
  const password = formData.get("password") as string;

  if (!name || !email || !password) {
    return { error: "Name, email, and password are required." };
  }

  const { error } = await auth.signUp.email({
    name,
    email,
    password,
  });

  if (error) {
    return { error: error.message || "Could not create account. Try again." };
  }

  return { success: true };
}
