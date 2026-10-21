import type { Metadata } from "next";
import Link from "next/link";
import { KeyRound, UserRound } from "lucide-react";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { Card, CardBody } from "@/components/ui/card";
import { requireSession } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await requireSession("/dashboard/settings");

  return (
    <DashboardShell session={session}>
      <h1 className="text-2xl font-extrabold sm:text-3xl">Settings</h1>
      <p className="mt-1 text-forest-600">Manage your account and sign-in security.</p>

      <div className="mt-8 grid max-w-3xl gap-6">
        <Card>
          <CardBody className="flex items-start gap-3">
            <UserRound className="mt-0.5 h-5 w-5 text-brand-700" aria-hidden />
            <div className="text-sm">
              <h2 className="text-base font-bold">Account</h2>
              <p className="mt-1 break-all text-forest-700">{session.email ?? "No email on file"}</p>
              <Link href="/dashboard/profile" className="mt-2 inline-block font-semibold text-brand-700 hover:underline">
                Edit your name on the Profile page
              </Link>
            </div>
          </CardBody>
        </Card>

        <Card id="security" className="scroll-mt-24">
          <CardBody>
            <div className="mb-4 flex items-start gap-3">
              <KeyRound className="mt-0.5 h-5 w-5 text-brand-700" aria-hidden />
              <div>
                <h2 className="text-base font-bold">Change password</h2>
                <p className="mt-1 text-sm text-forest-600">Use at least 8 characters with upper-case, lower-case and a number.</p>
              </div>
            </div>
            <div className="max-w-sm">
              <ResetPasswordForm />
            </div>
          </CardBody>
        </Card>
      </div>
    </DashboardShell>
  );
}
