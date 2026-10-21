import { ATTEMPT_GENERIC_ERROR, type AttemptInfo } from "./attempts";
import type { AttemptPaper, StudentQuestion } from "./paper";
import type { ActionResult } from "./types";

/**
 * Phase C4: decides what the student assessment page shows for the questions. No I/O of its own: the two
 * server actions are injected, so the flow is testable with mocks. Pure view logic, safe to import anywhere.
 *
 * Order of events (the only order allowed):
 *   1. ask the server for the student's OPEN attempt on this assessment (server confirms the attempt is theirs);
 *   2. only if one exists, ask the server for the paper of THAT attempt (server re-checks access);
 *   3. the paper arrives already allow-listed (Phase C3) and is checked once more to belong to that attempt.
 * Nothing here reads a key table, and nothing keeps the paper in client state: the page is a server component.
 */

export type PaperView =
  | { kind: "none" } // no open attempt: show nothing extra
  | { kind: "error"; message: string }
  | { kind: "empty"; paper: AttemptPaper }
  | { kind: "ready"; paper: AttemptPaper };

export interface PaperDeps {
  getOpenAttempt: (input: unknown) => Promise<ActionResult<{ attempt: AttemptInfo | null }>>;
  getPaper: (input: unknown) => Promise<ActionResult<{ paper: AttemptPaper }>>;
}

const error = (message: string = ATTEMPT_GENERIC_ERROR): PaperView => ({ kind: "error", message });

export async function loadPaperView(deps: PaperDeps, assessmentId: string): Promise<PaperView> {
  try {
    const open = await deps.getOpenAttempt({ assessmentId });
    if (!open.ok) return error(open.error);
    if (!open.attempt) return { kind: "none" };

    const res = await deps.getPaper({ attemptId: open.attempt.attemptId });
    if (!res.ok) return error(res.error);

    const { paper } = res;
    // Defence in depth: the paper must be for the attempt and assessment we asked about.
    if (paper.attempt.attemptId !== open.attempt.attemptId || paper.assessment.id !== assessmentId) return error();

    return paper.questions.length === 0 ? { kind: "empty", paper } : { kind: "ready", paper };
  } catch {
    // Never surface a thrown error's text to the student.
    return error();
  }
}

/** The one-line answering instruction under a question. Exhaustive: a new question type fails to compile here. */
export function answerInstruction(q: StudentQuestion): string {
  switch (q.type) {
    case "single_choice":
      return "Choose one answer.";
    case "multiple_select":
      return "Choose all that apply.";
    case "true_false":
      return "Answer true or false.";
    case "short_answer":
      return "Write a short answer.";
    case "descriptive":
      return "Write a detailed answer.";
    default: {
      const unreachable: never = q;
      void unreachable;
      return "";
    }
  }
}

/** "A", "B", ... for option labels. */
export function optionLabel(index: number): string {
  return String.fromCharCode(65 + (index % 26));
}

export const marksLabel = (marks: number) => `${marks} ${marks === 1 ? "mark" : "marks"}`;
