"use server";

import { studentContext } from "./student-context";
import {
  attemptAnswersSchema,
  mapAnswersSnapshot,
  mapSavedAnswer,
  saveAnswerSchema,
  saveFailureKind,
  toDbAnswer,
  type AnswersSnapshot,
  type SaveFailureKind,
  type SavedAnswer,
} from "./answers";
import { ATTEMPT_GENERIC_ERROR, attemptErrorMessage } from "./attempts";

/**
 * Student answer actions (Phase D): save one answer, restore the saved answers.
 *
 * Authority: the database. Each action runs as the signed-in student's own session (no elevated key exists
 * anywhere), calls one SECURITY DEFINER function, and never sends a user id: the function reads the caller from
 * auth.uid() and re-checks ownership, that the attempt is still open (not submitted, not past its deadline),
 * that the assessment is still available, that the question belongs to the attempt, and that the answer fits the
 * question type. The role check in studentContext is only an early, friendly rejection.
 *
 * Failures carry a `kind` so the autosave engine can tell a transient failure (retry the same request) from one
 * that can never succeed. The error text is always one of the fixed student-safe messages; the raw database
 * message and any thrown error text are never returned.
 *
 * Deliberately NOT here: submission, scoring, results (later phases).
 */

export type SaveAnswerResult =
  | { ok: true; saved: SavedAnswer }
  | { ok: false; error: string; kind: SaveFailureKind };

export type AnswersResult =
  | { ok: true; snapshot: AnswersSnapshot }
  | { ok: false; error: string; kind: SaveFailureKind };

const NOT_SIGNED_IN = {
  ok: false as const,
  error: "Please sign in with a student account to take an assessment.",
  kind: "closed" as const,
};
const BAD_INPUT = {
  ok: false as const,
  error: "That answer could not be saved. Please check it and try again.",
  kind: "rejected" as const,
};
const TRANSIENT = { ok: false as const, error: ATTEMPT_GENERIC_ERROR, kind: "retry" as const };

/**
 * Saves one answer. Safe to call repeatedly with the same input (a retry): a repeat changes nothing and replies
 * `applied: false` with what is stored. `revision` must increase with every edit of the same question; the
 * highest revision wins, so a late older request can never overwrite a newer answer. `answer: null` clears it.
 */
export async function saveAnswerAction(input: unknown): Promise<SaveAnswerResult> {
  try {
    const ctx = await studentContext();
    if (!ctx) return NOT_SIGNED_IN;
    const parsed = saveAnswerSchema.safeParse(input);
    if (!parsed.success) return BAD_INPUT;
    const { attemptId, questionId, answer, revision } = parsed.data;
    const { data, error } = await ctx.supabase.rpc("save_attempt_answer", {
      p_attempt: attemptId,
      p_question: questionId,
      p_answer: toDbAnswer(answer),
      p_revision: revision,
    });
    if (error) return { ok: false, error: attemptErrorMessage(error), kind: saveFailureKind(error) };
    const saved = mapSavedAnswer(data);
    // A well-formed success always maps. Anything else is treated as transient: the same request may be retried,
    // and the database makes that safe.
    return saved ? { ok: true, saved } : TRANSIENT;
  } catch {
    return TRANSIENT;
  }
}

/** The caller's saved answers for one of their own OPEN attempts (for restoring the page after a reload). */
export async function getAttemptAnswersAction(input: unknown): Promise<AnswersResult> {
  try {
    const ctx = await studentContext();
    if (!ctx) return NOT_SIGNED_IN;
    const parsed = attemptAnswersSchema.safeParse(input);
    if (!parsed.success) return BAD_INPUT;
    const { data, error } = await ctx.supabase.rpc("get_attempt_answers", { p_attempt: parsed.data.attemptId });
    if (error) return { ok: false, error: attemptErrorMessage(error), kind: saveFailureKind(error) };
    const snapshot = mapAnswersSnapshot(data);
    return snapshot ? { ok: true, snapshot } : TRANSIENT;
  } catch {
    return TRANSIENT;
  }
}
