import type { AssessmentStatus, QuestionType } from "@/types/app";

/** Teacher-side question shape. Contains the answer key: staff only, never send to students. */
export interface EditorOption {
  id?: string;
  text: string;
  isCorrect: boolean;
}

export interface EditorQuestion {
  id: string;
  type: QuestionType;
  text: string;
  marks: number;
  position: number;
  options: EditorOption[];
  correctBoolean: boolean | null;
  acceptedAnswers: string[];
  caseSensitive: boolean;
  explanation: string;
}

export interface EditorAssessment {
  id: string;
  title: string;
  description: string;
  instructions: string;
  courseId: string;
  courseTitle: string;
  grade: number | null;
  unitId: string | null;
  status: AssessmentStatus;
  totalMarks: number;
  passingMarks: number | null;
  durationMinutes: number | null;
  attemptLimit: number | null;
  opensAt: string | null;
  closesAt: string | null;
  updatedAt: string;
}

export interface UnitOption {
  id: string;
  title: string;
}

export interface CourseOption {
  id: string;
  title: string;
  grade: number | null;
  units: UnitOption[];
}

/** Everything the editor needs after a question change. */
export interface Snapshot {
  questions: EditorQuestion[];
  totalMarks: number;
  passingMarks: number | null;
}

export interface AssessmentListItem {
  id: string;
  title: string;
  status: AssessmentStatus;
  totalMarks: number;
  durationMinutes: number | null;
  closesAt: string | null;
  updatedAt: string;
  courseTitle: string;
  grade: number | null;
  questionCount: number;
}

/** Student-safe question: no keys, no explanation, no correctness flags. */
export interface PreviewQuestion {
  id: string;
  type: QuestionType;
  text: string;
  marks: number;
  options: { id: string; text: string }[];
}

export type ActionResult<T extends object = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string; fieldErrors?: Record<string, string>; issues?: string[] };
