import { z } from "zod";

/**
 * Pure helpers for assessment attempts (Phase B). No I/O, safe to import anywhere.
 * The database is the authority for every rule (eligibility, window, limit, deadline). Nothing here
 * decides whether an attempt is allowed; it only validates input shape and maps results and errors.
 */

export type AttemptStatus = "in_progress" | "submitted" | "expired";

/** What the attempt functions return. `status` is the EFFECTIVE status (overdue open attempts read as expired). */
export interface AttemptInfo {
  attemptId: string;
  assessmentId: string;
  attemptNumber: number;
  status: AttemptStatus;
  startedAt: string;
  /** null = the assessment is untimed and never closes. */
  expiresAt: string | null;
  submittedAt: string | null;
  /** Database clock at the moment of the call; use it to correct for client clock skew. */
  serverNow: string;
  /** null = no deadline. Counted by the server at response time; the client should count down from it. */
  secondsRemaining: number | null;
  /** true when an existing attempt was returned instead of creating a new one. */
  resumed: boolean;
}

const uuid = z.string().uuid();

export const startAttemptSchema = z.object({
  assessmentId: uuid,
  /** One fresh UUID per user click; reuse the SAME value when retrying that click. */
  requestKey: uuid.optional(),
});
export const attemptIdSchema = z.object({ attemptId: uuid });
export const openAttemptSchema = z.object({ assessmentId: uuid });

type Row = Record<string, unknown>;

const STATUSES: readonly string[] = ["in_progress", "submitted", "expired"];

const str = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const strOrNull = (v: unknown): v is string | null => v === null || v === undefined || str(v);

/**
 * Maps one database result to AttemptInfo. Accepts the object PostgREST returns for a single composite and
 * a one-element array (set-returning functions). Anything malformed returns null so callers fail closed.
 */
export function mapAttemptInfo(raw: unknown): AttemptInfo | null {
  const r = (Array.isArray(raw) ? raw[0] : raw) as Row | null | undefined;
  if (!r || typeof r !== "object") return null;
  if (!str(r.attempt_id) || !str(r.assessment_id) || !str(r.started_at) || !str(r.server_now)) return null;
  if (typeof r.attempt_number !== "number" || !Number.isInteger(r.attempt_number)) return null;
  if (typeof r.status !== "string" || !STATUSES.includes(r.status)) return null;
  if (!strOrNull(r.expires_at) || !strOrNull(r.submitted_at)) return null;
  const sr = r.seconds_remaining;
  if (sr !== null && sr !== undefined && (typeof sr !== "number" || !Number.isFinite(sr))) return null;
  return {
    attemptId: r.attempt_id,
    assessmentId: r.assessment_id,
    attemptNumber: r.attempt_number,
    status: r.status as AttemptStatus,
    startedAt: r.started_at,
    expiresAt: (r.expires_at as string | null | undefined) ?? null,
    submittedAt: (r.submitted_at as string | null | undefined) ?? null,
    serverNow: r.server_now,
    secondsRemaining: sr === null || sr === undefined ? null : Math.max(0, Math.floor(sr)),
    resumed: r.resumed === true,
  };
}

/** Same rows, as a list (get_my_open_attempt returns 0 or 1). Malformed rows are dropped. */
export function mapAttemptRows(raw: unknown): AttemptInfo[] {
  if (!Array.isArray(raw)) {
    const one = mapAttemptInfo(raw);
    return one ? [one] : [];
  }
  return raw.map((r) => mapAttemptInfo(r)).filter((a): a is AttemptInfo => a !== null);
}

export const ATTEMPT_GENERIC_ERROR = "Something went wrong. Please try again.";

/**
 * Fixed, student-safe wording per database error code. The raw database message is never shown.
 * EA007 (attempt submitted or expired) is raised when a paper is requested or an answer is saved or restored.
 * EA008 / EA009 are raised only by answer saving (Phase D).
 * EA001 deliberately covers missing, draft, unpublished-course and not-enrolled alike.
 */
export function attemptErrorMessage(error: { code?: string | null } | null | undefined): string {
  switch (error?.code) {
    case "42501":
      return "Please sign in with a student account to take an assessment.";
    case "EA001":
      return "This assessment is not available to you.";
    case "EA002":
      return "This assessment has not opened yet.";
    case "EA003":
      return "This assessment is closed.";
    case "EA004":
      return "You have used all of your attempts for this assessment.";
    case "EA005":
      return "We could not find that attempt.";
    case "EA006":
      return "This request has already been used. Please try again.";
    case "EA007":
      return "This attempt is no longer open.";
    case "EA008":
      return "That question is not part of this attempt.";
    case "EA009":
      return "That answer could not be saved. Please check it and try again.";
    default:
      return ATTEMPT_GENERIC_ERROR;
  }
}

/** True while the student may still work on the attempt. Display aid only: the server re-checks everything. */
export function isAttemptOpen(a: Pick<AttemptInfo, "status" | "secondsRemaining">): boolean {
  return a.status === "in_progress" && (a.secondsRemaining === null || a.secondsRemaining > 0);
}
