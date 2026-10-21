"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Clock3, LoaderCircle, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { releaseAssessmentResultsAction } from "@/lib/reports/actions";

export type AssessmentAnalyticsRow = {
  assessment_id: string;
  assessment_title: string;
  course_title: string;
  assessment_status: string;
  results_release: "immediate" | "after_close" | "manual" | string;
  results_released_at: string | null;
  closes_at: string | null;
  total_attempts: number | string;
  submitted_attempts: number | string;
  graded_attempts: number | string;
  pending_attempts: number | string;
  average_score: number | string | null;
  max_marks: number | string | null;
};

const count = (value: number | string | null | undefined) => Number(value ?? 0);

export function AssessmentAnalytics({ rows, evaluatedAt }: { rows: AssessmentAnalyticsRow[]; evaluatedAt: string }) {
  const [pending, startTransition] = useTransition();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ id: string; text: string; ok: boolean } | null>(null);

  function release(row: AssessmentAnalyticsRow) {
    setActiveId(row.assessment_id);
    setMessage(null);
    startTransition(async () => {
      const result = await releaseAssessmentResultsAction(row.assessment_id);
      setMessage({ id: row.assessment_id, text: result.message, ok: result.ok });
      setActiveId(null);
    });
  }

  return <div className="space-y-4">
    {rows.map((row) => {
      const submitted = count(row.submitted_attempts);
      const pendingReview = count(row.pending_attempts);
      const isReleased = row.results_release === "immediate" ||
        (row.results_release === "after_close" && Boolean(row.closes_at) && new Date(row.closes_at as string).getTime() <= new Date(evaluatedAt).getTime()) ||
        (row.results_release === "manual" && Boolean(row.results_released_at));
      return <Card key={row.assessment_id}>
        <CardBody className="p-5">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-forest-500">{row.course_title}</p>
              <h2 className="mt-1 text-lg font-bold text-forest-950">{row.assessment_title}</h2>
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                <span className="rounded-full bg-sage-100 px-2.5 py-1 capitalize text-forest-700">Assessment: {row.assessment_status}</span>
                <span className="rounded-full bg-sand-100 px-2.5 py-1 text-forest-700">Release: {row.results_release.replace("_", " ")}</span>
                <span className={`rounded-full px-2.5 py-1 ${isReleased ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>
                  {isReleased ? "Results available by policy" : "Results not released"}
                </span>
              </div>
            </div>
            {row.results_release === "manual" && !row.results_released_at ? (
              <Button disabled={pending} onClick={() => release(row)} className="shrink-0">
                {pending && activeId === row.assessment_id ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <LockKeyhole className="h-4 w-4" />}
                Release results
              </Button>
            ) : <span className="inline-flex items-center gap-2 text-sm text-forest-600">
              {isReleased ? <CheckCircle2 className="h-4 w-4 text-emerald-700" /> : <Clock3 className="h-4 w-4" />}
              {row.results_release === "manual" ? "Released" : "Automatic policy"}
            </span>}
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Metric label="Attempts" value={count(row.total_attempts)} />
            <Metric label="Submitted" value={submitted} />
            <Metric label="Fully graded" value={count(row.graded_attempts)} />
            <Metric label="Awaiting grading" value={pendingReview} />
            <Metric label="Average score" value={row.average_score == null ? "—" : `${Number(row.average_score).toFixed(2)}${row.max_marks == null ? "" : ` / ${Number(row.max_marks).toFixed(2)}`}`} />
            <Metric label="Max marks" value={row.max_marks == null ? "—" : Number(row.max_marks).toFixed(2)} />
          </div>
          {message?.id === row.assessment_id && <p role="status" className={`mt-3 text-sm ${message.ok ? "text-emerald-800" : "text-red-700"}`}>{message.text}</p>}
        </CardBody>
      </Card>;
    })}
  </div>;
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-xl border border-sage-200 bg-sand-50 p-3">
    <p className="text-xs text-forest-500">{label}</p>
    <p className="mt-1 break-words text-lg font-extrabold tabular-nums text-forest-950">{value}</p>
  </div>;
}
