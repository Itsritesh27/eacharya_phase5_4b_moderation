import type { Metadata } from "next";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { ResourceLibrary } from "@/components/resources/resource-library";
import { requireRole } from "@/lib/auth/session";

export const metadata: Metadata = { title: "e-Content" };
export const dynamic = "force-dynamic";

export default async function StudentResourcesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireRole("student");
  const params = await searchParams;
  return (
    <DashboardShell session={session}>
      <ResourceLibrary basePath="/dashboard/student/resources" params={params} userId={session.userId} />
    </DashboardShell>
  );
}
