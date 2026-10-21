import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Clock3, FileCheck2, LockKeyhole } from "lucide-react";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Assessment result details" };
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
type DetailRow = {
  question_id: string;
  position: number;
  question_text: string;
  awarded_marks: number | null;
  max_marks: number;
  status: string;
  feedback: string | null;
};
function formatMarks(value: number | null | undefined) {
  return value == null || !Number.isFinite(Number(value)) ? "—" : Number(value).toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

export default async function StudentResultDetailPage({ params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await params;
  const session = await requireRole("student");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_my_results");
  const rows = (Array.isArray(data) ? data : []) as ResultRow[];
  // get_my_results is scoped to auth.uid(), so this also prevents cross-student attempt lookups.
  const result = rows.find((row) => row.attempt_id === attemptId);
  let detail: DetailRow[] = [];
  let detailError = false;
  if (result?.released) {
    const response = await supabase.rpc("get_my_result_detail", { p_attempt: attemptId });
    detailError = Boolean(response.error);
    detail = (Array.isArray(response.data) ? response.data : []) as DetailRow[];
  }

  return <DashboardShell session={session}>
    <div className="mb-6"><Link href="/dashboard/student/results" className="inline-flex items-center gap-2 text-sm font-semibold text-brand-700 hover:underline"><ArrowLeft className="h-4 w-4" aria-hidden /> Back to my results</Link></div>
    {error ? <Card><CardBody><h1 className="text-xl font-bold">Results are temporarily unavailable</h1><p className="mt-2 text-sm text-forest-600">Please try again later.</p></CardBody></Card>
      : !result ? <EmptyState icon={LockKeyhole} title="Result not found" description="This result is unavailable or does not belong to your account." />
      : <>
        <div className="mb-6"><h1 className="text-2xl font-extrabold text-forest-950">{result.assessment_title || "Assessment result"}</h1><p className="mt-1 text-sm text-forest-600">Attempt {result.attempt_number}</p></div>
        {!result.released ? <Card><CardBody><div className="flex gap-3"><LockKeyhole className="mt-1 h-5 w-5 text-amber-700" aria-hidden /><div><h2 className="font-semibold text-forest-900">Results have not been released</h2><p className="mt-1 text-sm text-forest-600">Your teacher has not made marks and feedback available yet.</p></div></div></CardBody></Card> : <>
          <div className="mb-6 grid gap-4 sm:grid-cols-3">
            <Card><CardBody><p className="text-xs font-semibold uppercase text-forest-600">Score</p><p className="mt-2 text-2xl font-bold">{formatMarks(result.score)} / {formatMarks(result.max_marks)}</p></CardBody></Card>
            <Card><CardBody><p className="text-xs font-semibold uppercase text-forest-600">Percentage</p><p className="mt-2 text-2xl font-bold">{result.percentage == null ? "—" : `${formatMarks(result.percentage)}%`}</p></CardBody></Card>
            <Card><CardBody><p className="text-xs font-semibold uppercase text-forest-600">Grading status</p><p className="mt-2 flex items-center gap-2 font-semibold">{result.grading_status === "graded" ? <FileCheck2 className="h-4 w-4" aria-hidden /> : <Clock3 className="h-4 w-4" aria-hidden />}{result.grading_status === "graded" ? "Final result" : "Pending review"}</p></CardBody></Card>
          </div>
          {result.overall_feedback && <Card className="mb-6"><CardBody><h2 className="font-bold">Teacher feedback</h2><p className="mt-2 whitespace-pre-wrap text-sm text-forest-700">{result.overall_feedback}</p></CardBody></Card>}
          <section><h2 className="mb-3 text-xl font-bold">Question-wise feedback</h2>{detailError ? <Card><CardBody><p className="text-sm text-forest-600">Question feedback is temporarily unavailable.</p></CardBody></Card> : detail.length === 0 ? <EmptyState icon={FileCheck2} title="No question feedback available" description="Question-wise feedback may not be enabled for this assessment, or no details have been released." /> : <div className="space-y-3">{detail.map((item) => <Card key={item.question_id}><CardBody><div className="flex flex-wrap justify-between gap-3"><h3 className="font-semibold">Question {item.position + 1}: {item.question_text}</h3><span className="text-sm font-semibold">{formatMarks(item.awarded_marks)} / {formatMarks(item.max_marks)}</span></div>{item.feedback && <p className="mt-3 whitespace-pre-wrap text-sm text-forest-700">{item.feedback}</p>}<p className="mt-2 text-xs capitalize text-forest-500">{item.status.replaceAll("_", " ")}</p></CardBody></Card>)}</div>}</section>
        </>}
      </>}
  </DashboardShell>;
}
