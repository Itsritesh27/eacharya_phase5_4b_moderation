import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/auth/auth-card";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { Alert } from "@/components/ui/alert";
import { isSignedIn } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Set New Password" };

export default async function ResetPasswordPage() {
  // The reset link signs the user in via /auth/callback first. No session = expired link.
  const signedIn = await isSignedIn();

  return (
    <AuthCard title="Set a new password" subtitle={signedIn ? "Choose a strong password." : undefined}>
      {signedIn ? (
        <ResetPasswordForm />
      ) : (
        <div className="space-y-4">
          <Alert tone="error">Your reset link is invalid or has expired.</Alert>
          <Link
            href="/auth/forgot-password"
            className="block text-center text-sm font-semibold text-brand-700 hover:underline"
          >
            Request a new link
          </Link>
        </div>
      )}
    </AuthCard>
  );
}
