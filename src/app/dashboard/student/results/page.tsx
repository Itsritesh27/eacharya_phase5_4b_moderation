import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Award, Clock3, FileCheck2, LockKeyhole } from "lucide-react";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "My Assessment Results" };
export const dynamic = "force-dynamic";

type ResultRow = {
  attempt_id: string;
  assessment_id: string;
  assessment_title: string;
  attempt_number: number;
  submitted_at: string | null;
  released: boolean;
  grading_status: "pending_review" | "graded" | null;
  score: number | null;
  max_marks: number | null;
  percentage: number | null;
  overall_feedback: string | null;
};

function dateLabel(value: string | null) {
  if (!value) return "Submission date unavailable";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Submission date unavailable"
    : new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function marks(value: number | null) {
  return value === null || !Number.isFinite(Number(value)) ? "—" : Number(value).toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

export default async function StudentResultsPage() {
  const session = await requireRole("student");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_my_results");
  const rows = (Array.isArray(data) ? data : []) as ResultRow[];

  return (
    <DashboardShell session={session}>
      <div className="mb-6">
        <Link href="/dashboard/student/assessments" className="inline-flex items-center gap-2 text-sm font-semibold text-brand-700 hover:underline">
          <ArrowLeft className="h-4 w-4" aria-hidden /> Back to assessments
        </Link>
      </div>
      <div className="mb-6 flex items-start gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
          <Award className="h-6 w-6" aria-hidden />
        </span>
        <div>
          <h1 className="text-2xl font-bold text-forest-950">My assessment results</h1>
          <p className="mt-1 text-sm text-forest-600">Scores appear here only when your teacher&apos;s result-release settings allow them.</p>
        </div>
      </div>

      {error ? (
        <Card><CardBody>
          <div className="flex items-start gap-3">
            <LockKeyhole className="mt-1 h-5 w-5 shrink-0 text-amber-700" aria-hidden />
            <div>
              <h2 className="font-semibold text-forest-900">Results are temporarily unavailable</h2>
              <p className="mt-1 text-sm text-forest-600">The results service could not be reached. Your submission has not been changed. Please try again later or contact your teacher if this continues.</p>
              <p className="mt-2 text-xs text-forest-500">If this persists, verify that the Phase F1 database migration is installed on the configured Supabase project.</p>
            </div>
          </div>
        </CardBody></Card>
      ) : rows.length === 0 ? (
        <EmptyState icon={FileCheck2} title="No submitted results yet" description="Once you submit an assessment and results become available, they will appear here." />
      ) : (
        <div className="space-y-4">
          {rows.map((result) => (
            <Card key={result.attempt_id}>
              <CardBody>
                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                  <div className="min-w-0">
                    <h2 className="text-lg font-bold text-forest-950">{result.assessment_title || "Assessment"}</h2>
                    <p className="mt-1 text-sm text-forest-600">Attempt {result.attempt_number} · Submitted {dateLabel(result.submitted_at)}</p>
                  </div>
                  <span className={`inline-flex w-fit items-center rounded-full px-3 py-1 text-xs font-semibold ${result.released ? "bg-sage-100 text-forest-800" : "bg-amber-100 text-amber-900"}`}>
                    {result.released ? "Results released" : "Not released yet"}
                  </span>
                </div>

                {!result.released ? (
                  <div className="mt-4 flex items-start gap-3 rounded-xl bg-sage-50 p-4">
                    <LockKeyhole className="mt-0.5 h-5 w-5 shrink-0 text-forest-600" aria-hidden />
                    <div>
                      <p className="font-semibold text-forest-900">Your teacher has not released these results</p>
                      <p className="mt-1 text-sm text-forest-600">Your score and feedback are hidden until the assessment&apos;s release conditions are met.</p>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-xl bg-sand-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-forest-600">Score</p>
                      <p className="mt-1 text-2xl font-bold text-forest-950">{marks(result.score)} <span className="text-base font-medium text-forest-600">/ {marks(result.max_marks)}</span></p>
                    </div>
                    <div className="rounded-xl bg-sand-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-forest-600">Percentage</p>
                      <p className="mt-1 text-2xl font-bold text-forest-950">{result.percentage === null ? "—" : `${marks(result.percentage)}%`}</p>
                    </div>
                    <div className="rounded-xl bg-sand-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-forest-600">Grading status</p>
                      <p className="mt-2 inline-flex items-center gap-2 font-semibold text-forest-900">
                        {result.grading_status === "graded" ? <FileCheck2 className="h-4 w-4" aria-hidden /> : <Clock3 className="h-4 w-4" aria-hidden />}
                        {result.grading_status === "graded" ? "Final result" : "Pending teacher review"}
                      </p>
                    </div>
                  </div>
                )}

                {result.released && result.grading_status !== "graded" && (
                  <p className="mt-3 text-sm text-amber-800">This score may be provisional because written answers are still awaiting teacher review.</p>
                )}
                <div className="mt-4">
                  <Link href={`/dashboard/student/results/${result.attempt_id}`} className="inline-flex items-center gap-2 text-sm font-semibold text-brand-700 hover:underline">
                    View result details <ArrowRight className="h-4 w-4" aria-hidden />
                  </Link>
                </div>

                {result.released && result.overall_feedback && (
                  <div className="mt-4 rounded-xl border border-sage-200 p-4">
                    <h3 className="text-sm font-semibold text-forest-900">Teacher feedback</h3>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-forest-700">{result.overall_feedback}</p>
                  </div>
                )}
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </DashboardShell>
  );
}
