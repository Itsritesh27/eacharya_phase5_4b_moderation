import type { Metadata } from "next";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { ResourceLibrary } from "@/components/resources/resource-library";
import { requireSession } from "@/lib/auth/session";

export const metadata: Metadata = { title: "e-Content Library" };
export const dynamic = "force-dynamic";

export default async function ResourcesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSession("/resources");
  const params = await searchParams;
  return (
    <DashboardShell session={session}>
      <ResourceLibrary basePath="/resources" params={params} userId={session.userId} />
    </DashboardShell>
  );
}
