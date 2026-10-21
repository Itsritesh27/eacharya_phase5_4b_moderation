"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Save } from "lucide-react";
import { Card, CardBody } from "@/components/ui/card";
import { gradeAttemptAnswerAction } from "@/lib/grading/actions";

export type GradingItem = {
  attempt_id: string;
  assessment_id: string;
  assessment_title: string;
  attempt_number: number;
  submitted_at: string | null;
  student_name: string;
  question_id: string;
  question_position: number;
  question_text: string;
  question_type: string;
  student_answer: Record<string, unknown> | null;
  max_marks: number;
  awarded_marks: number | null;
  score_status: string;
  feedback: string | null;
};

function answerText(answer: Record<string, unknown> | null) {
  if (!answer || Object.keys(answer).length === 0) return "No answer provided.";
  const preferred = ["text", "value", "option_id", "option_ids", "selected_option_id", "selected_option_ids"];
  const entries = Object.entries(answer).sort(([a], [b]) => {
    const ai = preferred.indexOf(a); const bi = preferred.indexOf(b);
    return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi);
  });
  return entries.map(([key, value]) => {
    let label = key.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
    let rendered: string;
    if (typeof value === "boolean") rendered = value ? "True" : "False";
    else if (Array.isArray(value)) rendered = value.map((item) => typeof item === "string" ? item : JSON.stringify(item)).join(", ");
    else if (typeof value === "string" || typeof value === "number") rendered = String(value);
    else rendered = JSON.stringify(value);
    if (["text", "value"].includes(key)) return rendered;
    if (["option_id", "option_ids", "selected_option_id", "selected_option_ids"].includes(key)) label = "Selected option(s)";
    return `${label}: ${rendered}`;
  }).join("\n");
}

export function GradingQueue({ items }: { items: GradingItem[] }) {
  const [grades, setGrades] = useState<Record<string, { marks: string; feedback: string }>>(() => {
    const initial: Record<string, { marks: string; feedback: string }> = {};
    for (const item of items) initial[`${item.attempt_id}:${item.question_id}`] = {
      marks: item.awarded_marks === null ? "" : String(item.awarded_marks),
      feedback: item.feedback ?? "",
    };
    return initial;
  });
  const [messages, setMessages] = useState<Record<string, string>>({});
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function update(key: string, patch: Partial<{ marks: string; feedback: string }>) {
    setGrades((old) => ({
      ...old,
      [key]: { marks: old[key]?.marks ?? "", feedback: old[key]?.feedback ?? "", ...patch },
    }));
  }

  function save(item: GradingItem) {
    const key = `${item.attempt_id}:${item.question_id}`;
    const grade = grades[key];
    const value = Number(grade?.marks);
    if (!grade || grade.marks.trim() === "" || !Number.isFinite(value) || value < 0 || value > Number(item.max_marks)) {
      setMessages((old) => ({ ...old, [key]: `Enter marks from 0 to ${item.max_marks}.` }));
      return;
    }
    setPendingKey(key);
    startTransition(async () => {
      const result = await gradeAttemptAnswerAction({
        attemptId: item.attempt_id,
        questionId: item.question_id,
        marks: value,
        feedback: grade.feedback,
      });
      setMessages((old) => ({ ...old, [key]: result.ok ? "Grade saved." : result.error }));
      setPendingKey(null);
      if (result.ok) window.location.reload();
    });
  }

  if (items.length === 0) {
    return <Card><CardBody><div className="py-8 text-center">
      <CheckCircle2 className="mx-auto h-8 w-8 text-forest-600" aria-hidden />
      <h2 className="mt-3 font-semibold text-forest-900">No answers awaiting review</h2>
      <p className="mt-1 text-sm text-forest-600">Submitted written answers that need manual grading will appear here.</p>
    </div></CardBody></Card>;
  }

  const attempts = new Map<string, { title: string; student: string; number: number; pending: number; graded: number }>();
  for (const item of items) {
    const existing = attempts.get(item.attempt_id) ?? { title: item.assessment_title, student: item.student_name, number: item.attempt_number, pending: 0, graded: 0 };
    if (item.score_status === "graded") existing.graded += 1; else existing.pending += 1;
    attempts.set(item.attempt_id, existing);
  }

  return <div className="space-y-5">
    <section aria-label="Submission summary" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {[...attempts.entries()].map(([attemptId, summary]) => <Card key={attemptId}><CardBody>
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">{summary.title}</p>
        <h2 className="mt-1 font-bold text-forest-950">{summary.student}</h2>
        <p className="mt-1 text-xs text-forest-600">Attempt {summary.number}</p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold"><span className="rounded-full bg-amber-100 px-2.5 py-1 text-amber-900">{summary.pending} pending</span><span className="rounded-full bg-sage-100 px-2.5 py-1 text-forest-800">{summary.graded} graded</span></div>
      </CardBody></Card>)}
    </section>
    <h2 className="text-lg font-bold text-forest-950">Questions to review</h2>
    {items.map((item, index) => {
      const key = `${item.attempt_id}:${item.question_id}`;
      const isNewAttempt = index === 0 || items[index - 1]?.attempt_id !== item.attempt_id;
      const grade = grades[key] ?? { marks: "", feedback: "" };
      const graded = item.score_status === "graded";
      return <div key={key} className="space-y-3">
        {isNewAttempt && <div className="border-b border-sage-200 pb-2 pt-3"><h2 className="text-lg font-bold text-forest-950">{item.assessment_title} · {item.student_name}</h2><p className="text-sm text-forest-600">Attempt {item.attempt_number} · questions in this submission are grouped below</p></div>}
        <Card><CardBody>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">{item.assessment_title} · Attempt {item.attempt_number}</p>
            <h2 className="mt-1 text-lg font-bold text-forest-950">Question {item.question_position}</h2>
            <p className="mt-1 text-sm text-forest-600">{item.student_name} · {item.question_type.replaceAll("_", " ")}</p>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${graded ? "bg-sage-100 text-forest-800" : "bg-amber-100 text-amber-900"}`}>
            {graded ? "Graded" : "Pending review"}
          </span>
        </div>
        <div className="mt-4 rounded-xl bg-sand-50 p-4">
          <h3 className="text-sm font-semibold text-forest-900">Question</h3>
          <p className="mt-1 whitespace-pre-wrap text-sm text-forest-800">{item.question_text}</p>
        </div>
        <div className="mt-3 rounded-xl border border-sage-200 p-4">
          <h3 className="text-sm font-semibold text-forest-900">Student answer</h3>
          <pre className="mt-2 whitespace-pre-wrap break-words font-sans text-sm text-forest-800">{answerText(item.student_answer)}</pre>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-[160px_1fr]">
          <label className="block text-sm font-semibold text-forest-900">
            Marks (max {item.max_marks})
            <input type="number" min="0" max={item.max_marks} step="0.25" value={grade.marks}
              onChange={(e) => update(key, { marks: e.target.value })}
              className="mt-1 block w-full rounded-xl border border-sage-300 bg-white px-3 py-2 font-normal"
              aria-label={`Marks for question ${item.question_position}`} />
          </label>
          <label className="block text-sm font-semibold text-forest-900">
            Feedback (optional)
            <textarea maxLength={5000} rows={3} value={grade.feedback}
              onChange={(e) => update(key, { feedback: e.target.value })}
              className="mt-1 block w-full rounded-xl border border-sage-300 bg-white px-3 py-2 font-normal"
              placeholder="Write constructive feedback for the student." />
          </label>
        </div>
        {messages[key] && <p role="status" className="mt-3 text-sm text-forest-700">{messages[key]}</p>}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-forest-500">{item.submitted_at ? `Submitted ${new Date(item.submitted_at).toLocaleString()}` : "Submission date unavailable"}</p>
          <button type="button" disabled={isPending && pendingKey === key}
            onClick={() => save(item)}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-60">
            {graded ? <CheckCircle2 className="h-4 w-4" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
            {isPending && pendingKey === key ? "Saving…" : graded ? "Update grade" : "Save grade"}
          </button>
        </div>
      </CardBody></Card>
      </div>;
    })}
  </div>;
}
