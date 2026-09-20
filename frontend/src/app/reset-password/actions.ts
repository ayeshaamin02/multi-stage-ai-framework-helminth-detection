"use server";

import { auth } from "@/lib/auth/server";
import { redirect } from "next/navigation";

export type ResetPasswordFormState = { error: string } | null;

export async function resetPasswordWithToken(
  _prev: ResetPasswordFormState,
  formData: FormData,
): Promise<ResetPasswordFormState> {
  const token = (formData.get("token") as string)?.trim();
  const password = formData.get("password") as string;
  const confirm = formData.get("confirm") as string;

  if (!token) {
    return { error: "Reset link is missing or invalid. Request a new link." };
  }

  if (!password || !confirm) {
    return { error: "Password and confirmation are required." };
  }

  if (password !== confirm) {
    return { error: "Passwords do not match." };
  }

  const { error } = await auth.resetPassword({
    newPassword: password,
    token,
  });

  if (error) {
    return {
      error: error.message || "Could not reset password. Try again.",
    };
  }

  redirect("/login?reset=success");
}
