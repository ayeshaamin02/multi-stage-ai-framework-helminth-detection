"use server";

import { getAppOrigin } from "@/lib/auth/app-origin";
import { auth } from "@/lib/auth/server";

export type ForgotPasswordFormState =
  | { error: string }
  | { success: true }
  | null;

export async function requestPasswordReset(
  _prev: ForgotPasswordFormState,
  formData: FormData,
): Promise<ForgotPasswordFormState> {
  const email = (formData.get("email") as string)?.trim();

  if (!email) {
    return { error: "Email is required." };
  }

  let origin: string;
  try {
    origin = await getAppOrigin();
  } catch {
    return {
      error:
        "Server configuration error: site URL is not set. Add NEXT_PUBLIC_SITE_URL to your environment.",
    };
  }

  const redirectTo = `${origin}/reset-password`;

  const { error } = await auth.requestPasswordReset({
    email,
    redirectTo,
  });

  if (error) {
    return {
      error: error.message || "Could not start password reset. Try again.",
    };
  }

  return { success: true };
}
