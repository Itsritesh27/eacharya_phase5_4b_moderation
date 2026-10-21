import type { Metadata } from "next";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { ProfileForm } from "@/components/dashboard/profile-form";
import { Card, CardBody } from "@/components/ui/card";
import { requireSession } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Profile" };
export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const session = await requireSession("/dashboard/profile");

  return (
    <DashboardShell session={session}>
      <h1 className="text-2xl font-extrabold sm:text-3xl">Profile</h1>
      <p className="mt-1 text-forest-600">Your account details.</p>

      <Card className="mt-8 max-w-xl">
        <CardBody className="space-y-6">
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-forest-500">Email</dt>
              <dd className="mt-0.5 break-all font-medium">{session.email ?? "Not available"}</dd>
            </div>
            <div>
              <dt className="text-forest-500">Role</dt>
              <dd className="mt-0.5 font-medium capitalize">{session.profile.role}</dd>
            </div>
          </dl>
          <ProfileForm initialName={session.profile.full_name} />
        </CardBody>
      </Card>
    </DashboardShell>
  );
}
