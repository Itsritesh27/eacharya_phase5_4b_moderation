import type { Metadata } from "next";
import Link from "next/link";
import { FilePlus2 } from "lucide-react";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { SettingsForm } from "@/components/assessments/settings-form";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { requireRole } from "@/lib/auth/session";
import { getTeacherCourses } from "@/lib/assessments/data";

export const metadata: Metadata = { title: "Create assessment" };
export const dynamic = "force-dynamic";

export default async function NewAssessmentPage() {
  const session = await requireRole("teacher");
  const courses = await getTeacherCourses(session.userId);

  return (
    <DashboardShell session={session}>
      <Link href="/dashboard/teacher/assessments" className="text-sm font-semibold text-brand-700 hover:underline">
        ← All assessments
      </Link>
      <h1 className="mb-6 mt-3 text-2xl font-extrabold sm:text-3xl">Create assessment</h1>

      {courses.length === 0 ? (
        <EmptyState
          icon={FilePlus2}
          title="You have no courses yet"
          description="Assessments belong to a course you created. Courses assigned to you by an administrator will appear here."
        />
      ) : (
        <Card className="max-w-3xl">
          <CardBody>
            <SettingsForm mode="create" courses={courses} />
          </CardBody>
        </Card>
      )}
    </DashboardShell>
  );
}
