import type { Metadata } from "next";
import { ClipboardCheck, ShieldAlert } from "lucide-react";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { GradingQueue, type GradingItem } from "@/components/grading/grading-queue";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Grade submissions" };
export const dynamic = "force-dynamic";

export default async function TeacherGradingPage() {
  const session = await requireRole("teacher");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_teacher_grading_queue");
  const items = (Array.isArray(data) ? data : []) as GradingItem[];

  return (
    <DashboardShell session={session}>
      <div className="mb-8 flex items-start gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
          <ClipboardCheck className="h-6 w-6" aria-hidden />
        </span>
        <div>
          <h1 className="text-2xl font-extrabold sm:text-3xl">Grade submissions</h1>
          <p className="mt-1 text-forest-600">Review written answers, award marks, and give students constructive feedback.</p>
        </div>
      </div>

      {error ? (
        <Card><CardBody>
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-1 h-5 w-5 shrink-0 text-amber-700" aria-hidden />
            <div>
              <h2 className="font-semibold text-forest-900">Grading queue is unavailable</h2>
              <p className="mt-1 text-sm text-forest-600">The grading database function could not be reached. Verify that the Phase F1 and F3 migrations have been applied to the configured Supabase project.</p>
              <p className="mt-2 text-xs text-forest-500">No grades were changed by loading this page.</p>
            </div>
          </div>
        </CardBody></Card>
      ) : items.length === 0 ? (
        <EmptyState icon={ClipboardCheck} title="No answers awaiting review" description="When students submit assessments containing written questions, those answers will appear here." />
      ) : (
        <>
          <p className="mb-4 text-sm text-forest-600">{items.length} written answer{items.length === 1 ? "" : "s"} available for review.</p>
          <GradingQueue items={items} />
        </>
      )}
    </DashboardShell>
  );
}
