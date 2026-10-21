import type { AssessmentStatus } from "@/types/app";
import type { EditorQuestion, PreviewQuestion } from "./types";
import { questionFromEditor } from "./student-question";

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function sumMarks(questions: Pick<EditorQuestion, "marks">[]): number {
  return round2(questions.reduce((s, q) => s + q.marks, 0));
}

/**
 * Mirrors the database publish check (assert_assessment_publishable) so the
 * teacher sees every problem up front. The database trigger remains the authority.
 */
export function getPublishIssues(questions: EditorQuestion[], totalMarks: number): string[] {
  const issues: string[] = [];
  if (questions.length === 0) {
    return ["Add at least one question before publishing."];
  }
  const sum = sumMarks(questions);
  if (sum !== round2(totalMarks)) {
    issues.push(`Question marks add up to ${sum}, but the assessment total is ${totalMarks}.`);
  }
  questions.forEach((q, i) => {
    const n = i + 1;
    if (q.type === "single_choice" || q.type === "multiple_select") {
      const correct = q.options.filter((o) => o.isCorrect).length;
      if (q.options.length < 2) issues.push(`Question ${n} needs at least two options.`);
      else if (q.type === "single_choice" && correct !== 1) issues.push(`Question ${n} needs exactly one correct option.`);
      else if (q.type === "multiple_select" && correct < 1) issues.push(`Question ${n} needs at least one correct option.`);
    } else if (q.type === "true_false") {
      if (q.correctBoolean === null) issues.push(`Question ${n} needs a correct true/false answer.`);
    } else if (q.type === "short_answer") {
      if (q.acceptedAnswers.length < 1) issues.push(`Question ${n} needs at least one accepted answer.`);
    }
  });
  return issues;
}

export type DisplayStatus = "draft" | "published" | "closed";

/** The database only has draft and published; "closed" is a published assessment past its closing time. */
export function displayStatus(status: AssessmentStatus, closesAt: string | null, now: Date): DisplayStatus {
  if (status === "draft") return "draft";
  if (closesAt && new Date(closesAt) <= now) return "closed";
  return "published";
}

/** Builds the student view through the Phase C3 safe layer: named fields only; keys, flags and explanations are never read. */
export function toPreviewQuestions(questions: EditorQuestion[]): PreviewQuestion[] {
  const out: PreviewQuestion[] = [];
  for (const q of questions) {
    const s = questionFromEditor(q);
    if (!s) continue; // unsupported type: leave it out of the preview rather than guess
    out.push({
      id: s.id,
      type: s.type,
      text: s.text,
      marks: s.marks,
      options: s.type === "single_choice" || s.type === "multiple_select" ? s.options : [],
    });
  }
  return out;
}

/** New order after moving the item at `index` by `delta` (-1 up, +1 down). Returns null if out of range. */
export function moveItem<T>(items: T[], index: number, delta: -1 | 1): T[] | null {
  const to = index + delta;
  if (index < 0 || index >= items.length || to < 0 || to >= items.length) return null;
  const next = [...items];
  const [item] = next.splice(index, 1);
  if (item === undefined) return null;
  next.splice(to, 0, item);
  return next;
}
