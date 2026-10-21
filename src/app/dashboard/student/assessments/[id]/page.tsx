import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { AttemptPaperSection, PaperSkeleton } from "@/components/assessments/attempt-paper-section";
import { StartResumeButton } from "@/components/assessments/start-resume-button";
import { AvailabilityBadge } from "@/components/assessments/availability-badge";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { requireRole } from "@/lib/auth/session";
import { describeRules } from "@/lib/assessments/availability";
import { getStudentAssessment } from "@/lib/assessments/student-data";

export const metadata: Metadata = { title: "Assessment" };
export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });

export default async function StudentAssessmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();

  const session = await requireRole("student");
  // null unless published, in a published course, and the student is enrolled (RLS).
  const a = await getStudentAssessment(id);
  if (!a) notFound();

  const rules = describeRules(a, (iso) => dateFmt.format(new Date(iso)));

  return (
    <DashboardShell session={session}>
      <Link href="/dashboard/student/assessments" className="text-sm font-semibold text-brand-700 hover:underline">
        ← All assessments
      </Link>

      <div className="mb-6 mt-3 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-extrabold sm:text-3xl">{a.title}</h1>
        <AvailabilityBadge value={a.availability} />
      </div>
      <p className="-mt-3 mb-6 text-sm text-forest-600">
        {a.grade ? `Class ${a.grade} · ` : ""}
        {a.courseTitle}
        {a.unitTitle ? ` · ${a.unitTitle}` : ""}
      </p>

      <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
        <Card>
          <CardBody className="space-y-5">
            {a.description && <p className="text-forest-700">{a.description}</p>}
            <section aria-labelledby="inst-h">
              <h2 id="inst-h" className="text-sm font-bold uppercase tracking-wide text-forest-600">
                Instructions
              </h2>
              <p className="mt-2 whitespace-pre-line text-forest-800">
                {a.instructions || "Your teacher has not added any instructions."}
              </p>
            </section>
            <section aria-labelledby="rules-h">
              <h2 id="rules-h" className="text-sm font-bold uppercase tracking-wide text-forest-600">
                Rules
              </h2>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-forest-800">
                {rules.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </section>
          </CardBody>
        </Card>

        <aside aria-label="Assessment details">
          <Card>
            <CardBody className="space-y-4 p-5 sm:p-5">
              <dl className="grid grid-cols-2 gap-3">
                <div>
                  <dt className="text-xs text-forest-600">Questions</dt>
                  <dd className="text-2xl font-extrabold">{a.questionCount ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-forest-600">Total marks</dt>
                  <dd className="text-2xl font-extrabold">{a.totalMarks}</dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-xs text-forest-600">Duration</dt>
                  <dd className="font-semibold">{a.durationMinutes ? `${a.durationMinutes} minutes` : "No time limit"}</dd>
                </div>
              </dl>
              {a.questionCount === null && a.availability !== "closed" && (
                <p className="text-xs text-forest-600">The number of questions is shown once the assessment opens.</p>
              )}

              {a.availability === "closed" && <Alert tone="error">This assessment is closed and can no longer be started.</Alert>}
              {a.availability === "upcoming" && a.opensAt && (
                <Alert tone="error">This assessment opens {dateFmt.format(new Date(a.opensAt))}.</Alert>
              )}

              {a.availability === "open" ? (
                <StartResumeButton assessmentId={a.id} />
              ) : (
                <Button className="w-full" disabled>
                  {a.availability === "upcoming" ? "Not Open Yet" : "Assessment Closed"}
                </Button>
              )}
              <p className="text-xs text-forest-600">
                If you already have an open attempt, this action resumes it instead of creating another one.
              </p>
            </CardBody>
          </Card>
        </aside>
      </div>

      {/* Phase C4: questions of the student's own OPEN attempt, fetched on the server. Nothing for closed or upcoming. */}
      {a.availability === "open" && (
        <Suspense fallback={<PaperSkeleton />}>
          <AttemptPaperSection assessmentId={a.id} />
        </Suspense>
      )}
    </DashboardShell>
  );
}
