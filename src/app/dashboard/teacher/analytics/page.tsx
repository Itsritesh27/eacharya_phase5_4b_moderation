import type { Metadata } from "next";
import { BarChart3, ShieldAlert } from "lucide-react";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { AssessmentAnalytics, type AssessmentAnalyticsRow } from "@/components/reports/assessment-analytics";
import { AdvancedAssessmentAnalytics, type QuestionAnalysisRow, type StudentProgressRow } from "@/components/reports/advanced-assessment-analytics";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Assessment analytics & reports" };
export const dynamic = "force-dynamic";

export default async function TeacherAnalyticsPage() {
  const session = await requireRole("teacher");
  const supabase = await createClient();
  // Base and advanced analytics are independent: missing advanced RPCs should not
  // break the existing assessment summary cards.
  const [baseResult, studentResult, questionResult] = await Promise.all([
    supabase.rpc("get_teacher_assessment_analytics"),
    supabase.rpc("get_teacher_student_progress"),
    supabase.rpc("get_teacher_question_analysis"),
  ]);
  const { data, error } = baseResult;
  const rows = (Array.isArray(data) ? data : []) as AssessmentAnalyticsRow[];
  // Freeze the release-policy evaluation time across server render and hydration.
  const evaluatedAt = new Date().toISOString();
  const studentRows = (Array.isArray(studentResult.data) ? studentResult.data : []) as StudentProgressRow[];
  const questionRows = (Array.isArray(questionResult.data) ? questionResult.data : []) as QuestionAnalysisRow[];

  if (error) {
    // Keep the database message out of the browser; the code is enough to
    // correlate this failure with Supabase logs during development.
    console.error("[teacher-analytics] RPC failed", { code: error.code });
  }
  if (studentResult.error) {
    console.error("[teacher-analytics] student progress RPC failed", { code: studentResult.error.code });
  }
  if (questionResult.error) {
    console.error("[teacher-analytics] question analysis RPC failed", { code: questionResult.error.code });
  }

  return (
    <DashboardShell session={session}>
      <div className="mb-8 flex items-start gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
          <BarChart3 className="h-6 w-6" aria-hidden />
        </span>
        <div>
          <h1 className="text-2xl font-extrabold sm:text-3xl">Assessment Analytics &amp; Reports</h1>
          <p className="mt-1 text-forest-600">View assessment reports, submission totals, grading progress, average marks and result availability across your courses.</p>
        </div>
      </div>
      {error ? (
        <Card>
          <CardBody>
            <div className="flex gap-3">
              <ShieldAlert className="mt-1 h-5 w-5 shrink-0 text-amber-700" aria-hidden />
              <div>
                <h2 className="font-semibold">Analytics are unavailable</h2>
                <p className="mt-1 text-sm text-forest-600">The analytics request failed. Check the server terminal for the diagnostic code and verify teacher access and the Phase G migration.</p>
              </div>
            </div>
          </CardBody>
        </Card>
      ) : rows.length === 0 ? (
        <EmptyState icon={BarChart3} title="No assessment analytics yet" description="Assessment and attempt summaries will appear here when assessments have been created." />
      ) : (
        <AssessmentAnalytics rows={rows} evaluatedAt={evaluatedAt} />
      )}
      <AdvancedAssessmentAnalytics
        studentRows={studentRows}
        questionRows={questionRows}
        studentError={Boolean(studentResult.error)}
        questionError={Boolean(questionResult.error)}
      />
      <p className="mt-6 text-xs text-forest-500">Reports and analytics use the same assessment data and are scoped by database permissions to courses available to the signed-in teacher. Average scores exclude answers awaiting grading.</p>
    </DashboardShell>
  );
}
