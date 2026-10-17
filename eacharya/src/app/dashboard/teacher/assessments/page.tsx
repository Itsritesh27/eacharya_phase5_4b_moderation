import type { Metadata } from "next";
import { ClipboardList, Plus } from "lucide-react";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { AssessmentList } from "@/components/assessments/assessment-list";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { requireRole } from "@/lib/auth/session";
import { listTeacherAssessments } from "@/lib/assessments/data";

export const metadata: Metadata = { title: "Assessments" };
export const dynamic = "force-dynamic";

export default async function TeacherAssessmentsPage() {
  const session = await requireRole("teacher");
  // Throws on failure; error.tsx in this folder shows the retry screen.
  const items = await listTeacherAssessments(session.userId);

  return (
    <DashboardShell session={session}>
      <div className="mb-8 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold sm:text-3xl">Assessments</h1>
          <p className="mt-1 text-forest-600">Create, edit and publish quizzes and tests for your courses.</p>
        </div>
        <ButtonLink href="/dashboard/teacher/assessments/new">
          <Plus className="h-4 w-4" aria-hidden /> Create assessment
        </ButtonLink>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No assessments yet"
          description="Create your first assessment, add questions, then publish it for enrolled students."
        />
      ) : (
        <AssessmentList items={items} />
      )}
    </DashboardShell>
  );
}
