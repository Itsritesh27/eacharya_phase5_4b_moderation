import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardList, Clock } from "lucide-react";
import { AvailabilityBadge } from "@/components/assessments/availability-badge";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { requireRole } from "@/lib/auth/session";
import { listStudentAssessments } from "@/lib/assessments/student-data";

export const metadata: Metadata = { title: "Assessments" };
export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });

export default async function StudentAssessmentsPage() {
  const session = await requireRole("student");
  // Throws on failure; the student error boundary shows a retry screen.
  const items = await listStudentAssessments();

  return (
    <DashboardShell session={session}>
      <h1 className="text-2xl font-extrabold sm:text-3xl">Assessments</h1>
      <p className="mt-1 text-forest-600">Quizzes and tests for the courses you are enrolled in.</p>

      <div className="mt-8">
        {items.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title="No assessments available"
            description="When a teacher publishes an assessment for a course you are enrolled in, it will appear here."
          />
        ) : (
          <ul className="grid gap-4 lg:grid-cols-2" aria-label="Your assessments">
            {items.map((a) => (
              <li key={a.id} className="rounded-card border border-sage-200 bg-white p-5 shadow-card">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-base font-bold">
                    <Link href={`/dashboard/student/assessments/${a.id}`} className="hover:underline">
                      {a.title}
                    </Link>
                  </h2>
                  <AvailabilityBadge value={a.availability} />
                </div>
                <p className="mt-1 text-sm text-forest-600">
                  {a.grade ? `Class ${a.grade} · ` : ""}
                  {a.courseTitle}
                  {a.unitTitle ? ` · ${a.unitTitle}` : ""}
                </p>
                <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-forest-700">
                  <div className="flex gap-1.5">
                    <dt className="text-forest-600">Marks</dt>
                    <dd className="font-semibold">{a.totalMarks}</dd>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <dt className="sr-only">Duration</dt>
                    <Clock className="h-3.5 w-3.5 text-forest-500" aria-hidden />
                    <dd className="font-semibold">{a.durationMinutes ? `${a.durationMinutes} min` : "No time limit"}</dd>
                  </div>
                  {a.opensAt && a.availability === "upcoming" && (
                    <div className="flex gap-1.5">
                      <dt className="text-forest-600">Opens</dt>
                      <dd className="font-semibold">{dateFmt.format(new Date(a.opensAt))}</dd>
                    </div>
                  )}
                  {a.closesAt && (
                    <div className="flex gap-1.5">
                      <dt className="text-forest-600">{a.availability === "closed" ? "Closed" : "Closes"}</dt>
                      <dd className="font-semibold">{dateFmt.format(new Date(a.closesAt))}</dd>
                    </div>
                  )}
                </dl>
                <Link
                  href={`/dashboard/student/assessments/${a.id}`}
                  className="mt-4 inline-block text-sm font-semibold text-brand-700 hover:underline"
                >
                  View details
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </DashboardShell>
  );
}
