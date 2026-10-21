import { z } from "zod";

/**
 * Pure helpers for saving and restoring answers (Phase D). No I/O, safe to import anywhere, including the browser.
 *
 * The database is the authority for every rule (who owns the attempt, whether it is still open, whether the
 * question belongs to it, whether the answer fits the question type, which revision wins). Nothing here decides
 * whether an answer is allowed. It only:
 *   - validates the SHAPE of a request before it is sent (cheap early rejection, also caps the payload size);
 *   - converts between the client shape (camelCase) and the database shape (snake_case);
 *   - maps the database's replies, failing closed on anything unexpected;
 *   - classifies failures so the autosave engine knows whether to retry.
 */

/** Limits that mirror the database function. The database re-checks them per question type. */
export const ANSWER_LIMITS = {
  shortAnswerChars: 500,
  descriptiveChars: 10_000,
  maxOptionIds: 50,
  maxRevision: 1_000_000_000,
} as const;

/**
 * What a student's answer looks like on the client. Which variant is valid depends on the question's type
 * (single_choice -> optionId, multiple_select -> optionIds, true_false -> value, short_answer / descriptive -> text).
 * The database checks that; this type only says what the four shapes are.
 */
export type AnswerPayload =
  | { optionId: string }
  | { optionIds: string[] }
  | { value: boolean }
  | { text: string };

const uuid = z.string().uuid();

const answerPayloadSchema = z.union([
  z.object({ optionId: uuid }).strict(),
  z.object({ optionIds: z.array(uuid).max(ANSWER_LIMITS.maxOptionIds) }).strict(),
  z.object({ value: z.boolean() }).strict(),
  // the outer cap; the database applies the tighter per-type cap (500 for short answers)
  z.object({ text: z.string().max(ANSWER_LIMITS.descriptiveChars) }).strict(),
]);

/**
 * One save request. Extra fields (a user id, a score, ...) are stripped by zod and never forwarded.
 * `answer: null` clears the answer.
 */
export const saveAnswerSchema = z.object({
  attemptId: uuid,
  questionId: uuid,
  answer: answerPayloadSchema.nullable(),
  revision: z.number().int().min(1).max(ANSWER_LIMITS.maxRevision),
});
export type SaveAnswerInput = z.infer<typeof saveAnswerSchema>;

export const attemptAnswersSchema = z.object({ attemptId: uuid });

type Row = Record<string, unknown>;
const isObj = (v: unknown): v is Row => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const strOrNull = (v: unknown): v is string | null => v === null || v === undefined || str(v);

function sameKeys(o: Row, allowed: readonly string[]): boolean {
  const keys = Object.keys(o).sort();
  return keys.length === allowed.length && keys.every((k, i) => k === allowed[i]);
}

/** Client shape -> the object the database function expects. */
export function toDbAnswer(a: AnswerPayload | null): Row | null {
  if (a === null) return null;
  if ("optionId" in a) return { option_id: a.optionId };
  if ("optionIds" in a) return { option_ids: a.optionIds };
  if ("value" in a) return { value: a.value };
  return { text: a.text };
}

/**
 * The stored shape -> client shape. Accepts exactly one key with the right type; anything else is `undefined`
 * (malformed). `null` is a valid "no answer" value.
 */
export function fromDbAnswer(raw: unknown): AnswerPayload | null | undefined {
  if (raw === null) return null;
  if (!isObj(raw)) return undefined;
  const keys = Object.keys(raw);
  if (keys.length !== 1) return undefined;
  const [k] = keys;
  const v = raw[k as string];
  if (k === "option_id") return str(v) ? { optionId: v } : undefined;
  if (k === "option_ids") return Array.isArray(v) && v.length > 0 && v.every(str) ? { optionIds: [...(v as string[])] } : undefined;
  if (k === "value") return typeof v === "boolean" ? { value: v } : undefined;
  if (k === "text") return typeof v === "string" ? { text: v } : undefined;
  return undefined;
}

/** What save_attempt_answer says happened. */
export interface SavedAnswer {
  questionId: string;
  /** The revision now stored. Equals the one sent when `applied`; higher when a newer one was already stored. */
  revision: number;
  /** The answer now stored (null = cleared). May differ from what was sent when `applied` is false. */
  answer: AnswerPayload | null;
  /** false = nothing changed (a repeat of an earlier request, or an older revision than the stored one). Not an error. */
  applied: boolean;
  savedAt: string | null;
  serverNow: string;
  expiresAt: string | null;
  /** null = no deadline. */
  secondsRemaining: number | null;
}

const SAVE_KEYS = ["answer", "applied", "expires_at", "question_id", "revision", "saved_at", "seconds_remaining", "server_now"];

export function mapSavedAnswer(raw: unknown): SavedAnswer | null {
  if (!isObj(raw) || !sameKeys(raw, SAVE_KEYS)) return null;
  if (!str(raw.question_id) || typeof raw.applied !== "boolean") return null;
  if (typeof raw.revision !== "number" || !Number.isInteger(raw.revision) || raw.revision < 1) return null;
  if (!str(raw.server_now) || !strOrNull(raw.expires_at) || !strOrNull(raw.saved_at)) return null;
  const sr = raw.seconds_remaining;
  if (sr !== null && (typeof sr !== "number" || !Number.isFinite(sr))) return null;
  const answer = fromDbAnswer(raw.answer);
  if (answer === undefined) return null;
  return {
    questionId: raw.question_id,
    revision: raw.revision,
    answer,
    applied: raw.applied,
    savedAt: (raw.saved_at as string | null) ?? null,
    serverNow: raw.server_now,
    expiresAt: (raw.expires_at as string | null) ?? null,
    secondsRemaining: sr === null ? null : Math.max(0, Math.floor(sr as number)),
  };
}

/** One restored answer. */
export interface RestoredAnswer {
  questionId: string;
  revision: number;
  answer: AnswerPayload | null;
  savedAt: string | null;
}

export interface AnswersSnapshot {
  attemptId: string;
  expiresAt: string | null;
  serverNow: string;
  secondsRemaining: number | null;
  answers: RestoredAnswer[];
}

const SNAPSHOT_KEYS = ["answers", "attempt"];
const SNAPSHOT_ATTEMPT_KEYS = ["attempt_id", "expires_at", "seconds_remaining", "server_now", "status"];
const SNAPSHOT_ANSWER_KEYS = ["answer", "question_id", "revision", "saved_at"];

/** Maps get_attempt_answers. One bad entry rejects the whole snapshot (fail closed). */
export function mapAnswersSnapshot(raw: unknown): AnswersSnapshot | null {
  if (!isObj(raw) || !sameKeys(raw, SNAPSHOT_KEYS)) return null;
  const a = raw.attempt;
  if (!isObj(a) || !sameKeys(a, SNAPSHOT_ATTEMPT_KEYS)) return null;
  if (!str(a.attempt_id) || a.status !== "in_progress" || !str(a.server_now) || !strOrNull(a.expires_at)) return null;
  const sr = a.seconds_remaining;
  if (sr !== null && (typeof sr !== "number" || !Number.isFinite(sr))) return null;
  if (!Array.isArray(raw.answers)) return null;
  const answers: RestoredAnswer[] = [];
  const seen = new Set<string>();
  for (const item of raw.answers) {
    if (!isObj(item) || !sameKeys(item, SNAPSHOT_ANSWER_KEYS)) return null;
    if (!str(item.question_id) || seen.has(item.question_id)) return null;
    if (typeof item.revision !== "number" || !Number.isInteger(item.revision) || item.revision < 1) return null;
    if (!strOrNull(item.saved_at)) return null;
    const answer = fromDbAnswer(item.answer);
    if (answer === undefined) return null;
    seen.add(item.question_id);
    answers.push({
      questionId: item.question_id,
      revision: item.revision,
      answer,
      savedAt: (item.saved_at as string | null) ?? null,
    });
  }
  return {
    attemptId: a.attempt_id,
    expiresAt: (a.expires_at as string | null) ?? null,
    serverNow: a.server_now,
    secondsRemaining: sr === null ? null : Math.max(0, Math.floor(sr as number)),
    answers,
  };
}

/**
 * What the client should do about a failed save.
 *  - retry:    a transient or unknown failure. Send the SAME request again later (it is idempotent).
 *  - closed:   the attempt can no longer take answers (submitted, expired, closed, access lost, signed out,
 *              not found). Stop saving; retrying can never succeed.
 *  - rejected: this one answer was refused (wrong shape for the question, or the question is not in this attempt).
 *              Retrying the same answer can never succeed; the next edit is tried afresh.
 */
export type SaveFailureKind = "retry" | "closed" | "rejected";

export function saveFailureKind(error: { code?: string | null } | null | undefined): SaveFailureKind {
  switch (error?.code) {
    case "42501": // not signed in / not a student
    case "EA001": // not available
    case "EA002": // not open yet
    case "EA003": // closed
    case "EA005": // attempt not found (or not yours)
    case "EA007": // attempt no longer open
      return "closed";
    case "EA008": // question not in this attempt
    case "EA009": // answer or revision not valid
      return "rejected";
    default:
      // No code (network failure, timeout, 5xx), or a code we do not know: transient until proven otherwise.
      return "retry";
  }
}
