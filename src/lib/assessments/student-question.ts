import type { QuestionType } from "@/types/app";
import type { EditorQuestion } from "./types";

/**
 * Phase C3: the student-safe question response layer. No I/O, safe to import anywhere.
 *
 * One explicit response shape per supported question type. A student-facing question is always BUILT
 * field by field from these shapes (never copied, spread, or "minus the secrets"), so a field that is not
 * named here cannot reach the client, whatever a source object happens to carry.
 *
 * Two sources feed it:
 *  - the database function get_attempt_paper (wire JSON, snake_case), via mapStudentQuestion; and
 *  - the teacher's key-bearing EditorQuestion (for the student preview only), via questionFromEditor.
 * Teacher authoring (data.ts, actions.ts, EditorQuestion) is NOT changed: it keeps its answer keys behind
 * the existing teacher/admin checks and RLS. Nothing in this file reads or writes a key table.
 *
 * Feedback release: no feedback-release setting exists in any applied migration (it is only in the
 * unapplied proposal supabase/proposed/phase3_5_scoring_PROPOSAL.sql). With no configured rule the safe
 * behaviour is "not released", so NO student shape below has an explanation, feedback or correctness field.
 * When a release rule is built (scoring/results phase) it must add a separate, gated shape, not a field here.
 */

interface QuestionBase {
  id: string;
  position: number;
  text: string;
  /** https URL or null. Render with referrerPolicy="no-referrer". */
  imageUrl: string | null;
  marks: number;
}

export interface StudentOption {
  id: string;
  text: string;
}

export interface SingleChoiceQuestion extends QuestionBase {
  type: "single_choice";
  options: StudentOption[];
}
export interface MultipleSelectQuestion extends QuestionBase {
  type: "multiple_select";
  options: StudentOption[];
}
export interface TrueFalseQuestion extends QuestionBase {
  type: "true_false";
}
export interface ShortAnswerQuestion extends QuestionBase {
  type: "short_answer";
}
export interface DescriptiveQuestion extends QuestionBase {
  type: "descriptive";
}

/** A question as a student receives it. Discriminated on `type`. */
export type StudentQuestion =
  | SingleChoiceQuestion
  | MultipleSelectQuestion
  | TrueFalseQuestion
  | ShortAnswerQuestion
  | DescriptiveQuestion;

const BASE_FIELDS = ["id", "imageUrl", "marks", "position", "text", "type"] as const;

/** The complete, explicit list of fields a student may receive, per question type (client shape). */
export const STUDENT_QUESTION_FIELDS: Readonly<Record<QuestionType, readonly string[]>> = {
  single_choice: [...BASE_FIELDS, "options"],
  multiple_select: [...BASE_FIELDS, "options"],
  true_false: [...BASE_FIELDS],
  short_answer: [...BASE_FIELDS],
  descriptive: [...BASE_FIELDS],
};

/** Fields allowed on one option object. */
export const STUDENT_OPTION_FIELDS = ["id", "text"] as const;

/** Wire (database JSON) field list per type: same fields, snake_case, and a fixed `options` array. */
const WIRE_QUESTION_FIELDS = ["id", "image_url", "marks", "options", "position", "text", "type"] as const;

const CHOICE_TYPES: readonly QuestionType[] = ["single_choice", "multiple_select"];
const ALL_TYPES: readonly QuestionType[] = ["single_choice", "true_false", "multiple_select", "short_answer", "descriptive"];

export function isSupportedQuestionType(v: unknown): v is QuestionType {
  return typeof v === "string" && (ALL_TYPES as readonly string[]).includes(v);
}

export function isChoiceType(t: QuestionType): boolean {
  return CHOICE_TYPES.includes(t);
}

type Row = Record<string, unknown>;
const isObj = (v: unknown): v is Row => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** True only if the object has exactly these keys (no more, no fewer). */
export function hasExactKeys(o: Row, allowed: readonly string[]): boolean {
  const keys = Object.keys(o).sort();
  const want = [...allowed].sort();
  return keys.length === want.length && keys.every((k, i) => k === want[i]);
}

/**
 * Builds a StudentQuestion from the database JSON, or returns null. FAILS CLOSED: any extra key (on the
 * question or on an option), missing key, unsupported type, bad value, or options on a non-choice
 * question rejects the question, and the caller rejects the whole paper.
 */
export function mapStudentQuestion(raw: unknown): StudentQuestion | null {
  if (!isObj(raw) || !hasExactKeys(raw, WIRE_QUESTION_FIELDS)) return null;
  if (!isSupportedQuestionType(raw.type)) return null;
  if (!str(raw.id) || !str(raw.text)) return null;
  if (!num(raw.position) || !Number.isInteger(raw.position) || raw.position < 0) return null;
  if (!num(raw.marks) || raw.marks <= 0) return null;
  if (raw.image_url !== null && !(typeof raw.image_url === "string" && /^https:\/\//i.test(raw.image_url))) return null;
  if (!Array.isArray(raw.options)) return null;

  const base = {
    id: raw.id,
    position: raw.position,
    text: raw.text,
    imageUrl: raw.image_url as string | null,
    marks: raw.marks,
  };

  if (raw.type === "single_choice" || raw.type === "multiple_select") {
    const options = mapOptions(raw.options);
    if (!options) return null;
    return raw.type === "single_choice" ? { ...base, type: "single_choice", options } : { ...base, type: "multiple_select", options };
  }
  // Non-choice: the database sends an empty array and nothing else is accepted.
  if (raw.options.length !== 0) return null;
  switch (raw.type) {
    case "true_false":
      return { ...base, type: "true_false" };
    case "short_answer":
      return { ...base, type: "short_answer" };
    case "descriptive":
      return { ...base, type: "descriptive" };
    default:
      return null;
  }
}

function mapOptions(raw: unknown[]): StudentOption[] | null {
  if (raw.length === 0) return null;
  const out: StudentOption[] = [];
  const seen = new Set<string>();
  for (const o of raw) {
    if (!isObj(o) || !hasExactKeys(o, STUDENT_OPTION_FIELDS) || !str(o.id) || !str(o.text)) return null;
    if (seen.has(o.id)) return null;
    seen.add(o.id);
    out.push({ id: o.id, text: o.text });
  }
  return out;
}

/**
 * Builds the student-safe shape from a teacher's EditorQuestion (used only by the teacher's student preview).
 * Picks named fields; never spreads. Answer keys, correctness flags, accepted answers and the explanation
 * are simply not read. Options exist only for choice types. The preview has no image, so imageUrl is null.
 * Options without an id (not yet saved) get a stable placeholder id.
 */
export function questionFromEditor(q: EditorQuestion): StudentQuestion | null {
  if (!isSupportedQuestionType(q.type)) return null;
  const base = { id: q.id, position: q.position, text: q.text, imageUrl: null, marks: q.marks };
  if (q.type === "single_choice" || q.type === "multiple_select") {
    const options = q.options.map((o, i) => ({ id: o.id ?? `${q.id}-${i}`, text: o.text }));
    return q.type === "single_choice" ? { ...base, type: "single_choice", options } : { ...base, type: "multiple_select", options };
  }
  switch (q.type) {
    case "true_false":
      return { ...base, type: "true_false" };
    case "short_answer":
      return { ...base, type: "short_answer" };
    case "descriptive":
      return { ...base, type: "descriptive" };
  }
}

/**
 * Names that must never appear as a KEY anywhere in a student response, at any depth. This is a second
 * line of defence (a deep scan), not the first: the shapes above are the allow-list.
 */
const RESTRICTED_KEY = /correct|answer_?key|accepted|case_?sensitive|explanation|rubric|grading|grade_?key|solution|score|awarded|feedback|is_?right|expected/i;

/** Returns the paths of every restricted key found in a value (empty array = clean). Handles arrays and nesting. */
export function findRestrictedKeys(value: unknown, path = "$", seen: WeakSet<object> = new WeakSet()): string[] {
  if (typeof value !== "object" || value === null) return [];
  if (seen.has(value)) return [];
  seen.add(value);
  const found: string[] = [];
  if (Array.isArray(value)) {
    value.forEach((v, i) => found.push(...findRestrictedKeys(v, `${path}[${i}]`, seen)));
    return found;
  }
  for (const [k, v] of Object.entries(value)) {
    if (RESTRICTED_KEY.test(k)) found.push(`${path}.${k}`);
    found.push(...findRestrictedKeys(v, `${path}.${k}`, seen));
  }
  return found;
}

/** Final gate for a student response: true only if the questions have allow-listed keys and no restricted key at any depth. */
export function isStudentSafe(questions: StudentQuestion[]): boolean {
  if (findRestrictedKeys(questions).length > 0) return false;
  return questions.every((q) => {
    if (!isSupportedQuestionType(q.type)) return false;
    if (!hasExactKeys(q as unknown as Row, STUDENT_QUESTION_FIELDS[q.type])) return false;
    const opts = (q as { options?: unknown }).options;
    if (opts === undefined) return true;
    return Array.isArray(opts) && opts.every((o) => isObj(o) && hasExactKeys(o, STUDENT_OPTION_FIELDS));
  });
}
