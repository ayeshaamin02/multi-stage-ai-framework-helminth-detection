import { CustomCursor } from "@/components/custom-cursor";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { auth } from "@/lib/auth/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ForgotPasswordForm } from "./forgot-password-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Forgot password",
  description:
    "Request a link to reset your Helminth Detection account password.",
};

export default async function ForgotPasswordPage() {
  try {
    const { data: session } = await auth.getSession();
    if (session?.user) {
      redirect("/dashboard");
    }
  } catch {
    /* Neon Auth unreachable — show the form anyway */
  }

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <CustomCursor />
      <SiteHeader />
      <main className="relative flex flex-1 items-center justify-center px-4 py-16 sm:px-6">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-1/4 left-1/2 size-[600px] -translate-x-1/2 rounded-full bg-primary/[0.03] blur-3xl" />
        </div>
        <ForgotPasswordForm />
      </main>
      <SiteFooter />
    </div>
  );
}
