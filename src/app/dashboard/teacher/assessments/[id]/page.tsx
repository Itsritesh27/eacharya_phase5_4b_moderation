import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { AssessmentEditor } from "@/components/assessments/assessment-editor";
import { requireRole } from "@/lib/auth/session";
import { fetchOwnedAssessment, getTeacherCourses, loadEditorQuestions } from "@/lib/assessments/data";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Edit assessment" };
export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function EditAssessmentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();

  // Server-side guard: signed out -> sign-in, non-teachers -> their own dashboard.
  const session = await requireRole("teacher");
  const sp = await searchParams;

  const supabase = await createClient();
  // Returns null unless the assessment is in a course this teacher created (and RLS allows it).
  const assessment = await fetchOwnedAssessment(supabase, id, session.userId);
  if (!assessment) notFound();

  const [questions, courses] = await Promise.all([
    loadEditorQuestions(supabase, id),
    getTeacherCourses(session.userId),
  ]);
  const units = courses.find((c) => c.id === assessment.courseId)?.units ?? [];
  const tab = sp.tab === "preview" || sp.tab === "settings" ? sp.tab : "questions";

  return (
    <DashboardShell session={session}>
      <Link href="/dashboard/teacher/assessments" className="mb-4 inline-block text-sm font-semibold text-brand-700 hover:underline">
        ← All assessments
      </Link>
      <AssessmentEditor
        assessment={assessment}
        units={units}
        initialQuestions={questions}
        created={sp.created === "1"}
        openPublish={sp.publish === "1"}
        initialTab={tab}
      />
    </DashboardShell>
  );
}
