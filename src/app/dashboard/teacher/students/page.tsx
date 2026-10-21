import type { Metadata } from "next";
import { AlertTriangle, GraduationCap } from "lucide-react";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Students" };
export const dynamic = "force-dynamic";

interface Row {
  student_id: string;
  student_name: string;
  course_title: string;
  assessment_count: number;
  submitted_count: number;
  graded_count: number;
  pending_count: number;
  average_score: number | null;
}

export default async function TeacherStudentsPage() {
  const session = await requireRole("teacher");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_teacher_student_progress");
  if (error) console.error("[teacher-students] RPC failed", { code: error.code });
  const rows = (Array.isArray(data) ? data : []) as Row[];

  return (
    <DashboardShell session={session}>
      <h1 className="text-2xl font-extrabold sm:text-3xl">Students</h1>
      <p className="mt-1 text-forest-600">Learners enrolled in your courses, with their assessment progress.</p>

      <div className="mt-8">
        {error ? (
          <div className="flex gap-3 rounded-card border border-amber-300 bg-amber-50 p-5 text-sm text-forest-800">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden />
            <p>
              The student list could not be loaded. Run <code>fix_advanced_analytics.sql</code> (migration{" "}
              <code>20261101000001_phase2_advanced_analytics.sql</code>) in Supabase and confirm you are signed in as a teacher.
            </p>
          </div>
        ) : rows.length === 0 ? (
          <EmptyState icon={GraduationCap} title="No students yet" description="Students appear here once they enrol in a course you created." />
        ) : (
          <Card>
            <div className="overflow-x-auto rounded-card">
              <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                <thead className="bg-sage-50 text-xs uppercase tracking-wide text-forest-600">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-semibold">Student</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Course</th>
                    <th scope="col" className="px-4 py-3 text-right font-semibold">Submitted</th>
                    <th scope="col" className="px-4 py-3 text-right font-semibold">Graded</th>
                    <th scope="col" className="px-4 py-3 text-right font-semibold">Pending</th>
                    <th scope="col" className="px-4 py-3 text-right font-semibold">Avg marks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-sage-100">
                  {rows.map((r) => (
                    <tr key={`${r.student_id}:${r.course_title}`} className="hover:bg-sage-50/50">
                      <td className="px-4 py-3 font-semibold">{r.student_name || "Student"}</td>
                      <td className="px-4 py-3 text-forest-700">{r.course_title}</td>
                      <td className="px-4 py-3 text-right">{r.submitted_count}/{r.assessment_count}</td>
                      <td className="px-4 py-3 text-right">{r.graded_count}</td>
                      <td className="px-4 py-3 text-right">{r.pending_count}</td>
                      <td className="px-4 py-3 text-right">{r.average_score ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </DashboardShell>
  );
}
