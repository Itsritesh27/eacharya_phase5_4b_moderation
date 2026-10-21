import { mapAttemptInfo, type AttemptInfo } from "./attempts";
import { hasExactKeys, isStudentSafe, mapStudentQuestion, type StudentQuestion } from "./student-question";

export type { StudentQuestion } from "./student-question";

/**
 * Pure mapper for the question paper returned by the database function get_attempt_paper (Phase C2).
 * No I/O, safe to import anywhere.
 *
 * The database is the authority for who may read a paper (owner of an open attempt, enrolled, published,
 * inside the window). This file only turns the JSON into typed, student-safe objects, and FAILS CLOSED:
 * if the payload contains any field that is not on the allow-list below (for example a key that a later
 * migration accidentally adds), the whole paper is rejected (null) instead of being passed to the page.
 */

export interface AttemptPaper {
  attempt: AttemptInfo;
  assessment: {
    id: string;
    title: string;
    instructions: string;
    totalMarks: number;
    durationMinutes: number | null;
  };
  /** In the teacher's order (questions.position). */
  questions: StudentQuestion[];
}

const TOP_KEYS = ["assessment", "attempt", "questions"];
const ATTEMPT_KEYS = [
  "assessment_id", "attempt_id", "attempt_number", "expires_at", "seconds_remaining", "server_now", "started_at", "status",
];
const ASSESSMENT_KEYS = ["duration_minutes", "id", "instructions", "title", "total_marks"];

type Row = Record<string, unknown>;
const isObj = (v: unknown): v is Row => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const exactKeys = hasExactKeys;

/** Maps the database JSON to an AttemptPaper, or null if anything is malformed or off the allow-list. */
export function mapAttemptPaper(raw: unknown): AttemptPaper | null {
  if (!isObj(raw) || !exactKeys(raw, TOP_KEYS)) return null;
  const { attempt: rawAttempt, assessment: a, questions: rawQuestions } = raw as Row;

  if (!isObj(rawAttempt) || !exactKeys(rawAttempt, ATTEMPT_KEYS)) return null;
  // The paper endpoint only ever serves an open attempt; the AttemptInfo mapper wants `resumed`, which is not served.
  const attempt = mapAttemptInfo({ ...rawAttempt, submitted_at: null, resumed: true });
  if (!attempt || attempt.status !== "in_progress") return null;

  if (!isObj(a) || !exactKeys(a, ASSESSMENT_KEYS)) return null;
  if (!str(a.id) || !str(a.title) || typeof a.instructions !== "string" || !num(a.total_marks)) return null;
  const duration = a.duration_minutes;
  if (duration !== null && !(num(duration) && Number.isInteger(duration))) return null;
  if (a.id !== attempt.assessmentId) return null;

  if (!Array.isArray(rawQuestions)) return null;
  const questions: StudentQuestion[] = [];
  for (const q of rawQuestions) {
    const mapped = mapStudentQuestion(q);
    if (!mapped) return null;
    questions.push(mapped);
  }
  // Ids unique, positions strictly increasing: the order the database promised.
  const ids = new Set(questions.map((q) => q.id));
  if (ids.size !== questions.length) return null;
  for (let i = 1; i < questions.length; i++) {
    if ((questions[i] as StudentQuestion).position <= (questions[i - 1] as StudentQuestion).position) return null;
  }

  // Last gate (Phase C3): allow-listed keys per type and no restricted key at any depth.
  if (!isStudentSafe(questions)) return null;

  return {
    attempt,
    assessment: {
      id: a.id,
      title: a.title,
      instructions: a.instructions,
      totalMarks: a.total_marks,
      durationMinutes: duration === null ? null : (duration as number),
    },
    questions,
  };
}
