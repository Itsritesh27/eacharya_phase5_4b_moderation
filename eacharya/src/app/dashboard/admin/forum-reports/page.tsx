import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { BackToAdmin, QueueFilters, ReportQueue, StatusCounts } from "@/components/forum/moderation-sections";
import { requireRole } from "@/lib/auth/session";
import { parsePage } from "@/lib/forum/categories";
import {
  canModerateForum, parseReasonFilter, parseReportSort, parseStatusParam, parseTypeFilter, type ReportFilters,
} from "@/lib/forum/moderation";
import { getStatusCounts, listReports } from "@/lib/forum/moderation-data";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Forum reports" };
export const dynamic = "force-dynamic";

type Params = { status?: string; type?: string; reason?: string; sort?: string; page?: string };
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

export default async function ForumReportsPage({ searchParams }: { searchParams: Promise<Params> }) {
  // Server-side guard: signed-out visitors go to sign-in, students and teachers to their own dashboards.
  const session = await requireRole("admin");
  // Same rule the database applies (can_moderate_forum). Redundant today, and keeps this page correct if the rule is widened.
  if (!canModerateForum(session.profile.role)) redirect("/dashboard");

  const sp = await searchParams;
  const filters: ReportFilters = {
    status: parseStatusParam(one(sp.status)),
    type: parseTypeFilter(one(sp.type)),
    reason: parseReasonFilter(one(sp.reason)),
    sort: parseReportSort(one(sp.sort)),
    page: parsePage(one(sp.page)),
  };

  const supabase = await createClient();
  const [counts, result] = await Promise.all([getStatusCounts(supabase), listReports(supabase, filters)]);

  return (
    <DashboardShell session={session}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold sm:text-3xl">Forum reports</h1>
          <p className="mt-1 max-w-2xl text-forest-600">
            Review what members have reported. Hiding is reversible and nothing is deleted. Every action is recorded with your name and the time.
          </p>
        </div>
        <BackToAdmin />
      </div>
      <div className="mt-6"><StatusCounts counts={counts} filters={filters} /></div>
      <QueueFilters filters={filters} />
      <ReportQueue result={result} filters={filters} />
    </DashboardShell>
  );
}
