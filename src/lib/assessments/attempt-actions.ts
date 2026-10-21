"use server";

import { studentContext } from "./student-context";
import { logAttemptError } from "./attempt-log";
import type { ActionResult } from "./types";
import { mapAttemptPaper, type AttemptPaper } from "./paper";
import {
  ATTEMPT_GENERIC_ERROR,
  attemptErrorMessage,
  attemptIdSchema,
  mapAttemptInfo,
  mapAttemptRows,
  openAttemptSchema,
  startAttemptSchema,
  type AttemptInfo,
} from "./attempts";

/**
 * Student assessment-attempt actions (Phase B).
 *
 * Authority: the database. Every action runs as the signed-in student's own session (no service-role
 * key exists anywhere), calls one SECURITY DEFINER function, and never sends a user id: the function
 * reads the caller from auth.uid(). The role check below is only an early, friendly rejection; it is not
 * what protects the data.
 *
 * Phase C2 adds getAttemptPaperAction: the only way a student receives question content (see below).
 * Answer saving and restore live in answer-actions.ts (Phase D). Deliberately NOT here: scoring (a later phase).
 */

type AttemptResult = ActionResult<{ attempt: AttemptInfo }>;

const NO_ACCESS = { ok: false as const, error: "Please sign in with a student account to take an assessment." };
const BAD_INPUT = { ok: false as const, error: "That request was not valid. Please go back and try again." };

function finish(
  data: unknown,
  error: { code?: string | null; message?: string | null } | null,
  operation = "attempt",
  overrides: Record<string, string> = {},
): AttemptResult {
  if (error) {
    logAttemptError(operation, error);
    return { ok: false, error: (error.code && overrides[error.code]) || attemptErrorMessage(error) };
  }
  const attempt = mapAttemptInfo(data);
  // A well-formed success always has an attempt. Anything else fails closed.
  return attempt ? { ok: true, attempt } : { ok: false, error: ATTEMPT_GENERIC_ERROR };
}

/** Starts an attempt, or returns the open one. Pass one fresh requestKey per click and reuse it on retries. */
export async function startAttemptAction(input: unknown): Promise<AttemptResult> {
  const ctx = await studentContext();
  if (!ctx) return NO_ACCESS;
  const parsed = startAttemptSchema.safeParse(input);
  if (!parsed.success) return BAD_INPUT;
  const { data, error } = await ctx.supabase.rpc("start_assessment_attempt", {
    p_assessment: parsed.data.assessmentId,
    p_request_key: parsed.data.requestKey ?? null,
  });
  return finish(data, error, "start_assessment_attempt");
}

/** Safe retrieval of one of the caller's own attempts. Someone else's attempt looks the same as a missing one. */
export async function getAttemptAction(input: unknown): Promise<AttemptResult> {
  const ctx = await studentContext();
  if (!ctx) return NO_ACCESS;
  const parsed = attemptIdSchema.safeParse(input);
  if (!parsed.success) return BAD_INPUT;
  const { data, error } = await ctx.supabase.rpc("get_my_attempt", { p_attempt: parsed.data.attemptId });
  return finish(data, error, "get_my_attempt");
}

/** The caller's open attempt for an assessment, or `attempt: null` when there is none. */
export async function getOpenAttemptAction(
  input: unknown,
): Promise<ActionResult<{ attempt: AttemptInfo | null }>> {
  const ctx = await studentContext();
  if (!ctx) return NO_ACCESS;
  const parsed = openAttemptSchema.safeParse(input);
  if (!parsed.success) return BAD_INPUT;
  const { data, error } = await ctx.supabase.rpc("get_my_open_attempt", { p_assessment: parsed.data.assessmentId });
  if (error) {
    logAttemptError("get_my_open_attempt", error);
    return { ok: false, error: attemptErrorMessage(error) };
  }
  const rows = mapAttemptRows(data);
  // The function returns at most one row; more than one would be a server bug, so fail closed.
  if (rows.length > 1) return { ok: false, error: ATTEMPT_GENERIC_ERROR };
  return { ok: true, attempt: rows[0] ?? null };
}

/**
 * Submit. The database submits and scores in one transaction. After the deadline the result is `expired`, not
 * `submitted`. Unexpected database failures are logged server-side (see attempt-log.ts) and shown generically.
 */
export async function submitAttemptAction(input: unknown): Promise<AttemptResult> {
  const ctx = await studentContext();
  if (!ctx) return NO_ACCESS;
  const parsed = attemptIdSchema.safeParse(input);
  if (!parsed.success) return BAD_INPUT;
  const { data, error } = await ctx.supabase.rpc("submit_attempt", { p_attempt: parsed.data.attemptId });
  return finish(data, error, "submit_attempt", {
    // Raised by scoring (score_attempt) when the paper cannot be scored. The submit was rolled back, answers are kept.
    "23514": "Your answers are saved, but this assessment could not be scored right now. Please tell your teacher.",
  });
}

/**
 * Phase C2: the questions of one of the caller's own OPEN attempts.
 *
 * The client sends only an attempt id. The database function get_attempt_paper takes the user from auth.uid(),
 * checks that the attempt is theirs, effectively in progress, and that the assessment is still published,
 * the course published, the student enrolled and the window open, then returns an explicit allow-list of
 * fields for THAT assessment's questions only. Someone else's attempt looks the same as a missing one.
 * The result is re-validated by mapAttemptPaper, which rejects the whole paper if any unexpected field appears.
 * This action never reads the answer-key tables and never uses a service-role client.
 */
export async function getAttemptPaperAction(input: unknown): Promise<ActionResult<{ paper: AttemptPaper }>> {
  const ctx = await studentContext();
  if (!ctx) return NO_ACCESS;
  const parsed = attemptIdSchema.safeParse(input);
  if (!parsed.success) return BAD_INPUT;
  const { data, error } = await ctx.supabase.rpc("get_attempt_paper", { p_attempt: parsed.data.attemptId });
  if (error) {
    logAttemptError("get_attempt_paper", error);
    return { ok: false, error: attemptErrorMessage(error) };
  }
  const paper = mapAttemptPaper(data);
  // A well-formed success always maps. Anything else fails closed and no content is passed on.
  return paper ? { ok: true, paper } : { ok: false, error: ATTEMPT_GENERIC_ERROR };
}
