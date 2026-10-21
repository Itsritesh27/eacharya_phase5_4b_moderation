// Application types. Replace with generated types later:
//   npx supabase gen types typescript --project-id <ref> > src/types/database.ts

export type Role = "student" | "teacher" | "admin";
export type CourseStatus = "draft" | "published";

export interface Profile {
  id: string;
  full_name: string;
  avatar_url: string | null;
  role: Role;
  created_at: string;
  updated_at: string;
}

export interface ClassRow {
  id: string;
  grade: 9 | 10 | 11 | 12;
  name: string;
  description: string;
  is_active: boolean;
}

export interface SubjectRow {
  id: string;
  name: string;
  slug: string;
  description: string;
  is_active: boolean;
}

export interface CourseRow {
  id: string;
  title: string;
  slug: string;
  description: string;
  class_id: string;
  subject_id: string;
  thumbnail_url: string | null;
  status: CourseStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface UnitRow {
  id: string;
  course_id: string;
  title: string;
  description: string;
  position: number;
}

export interface LessonRow {
  id: string;
  unit_id: string;
  title: string;
  description: string;
  position: number;
  is_published: boolean;
}

// ---------------------------------------------------------------
// Phase 2: learning experience
// ---------------------------------------------------------------
export type ResourceType = "pdf" | "notes" | "presentation" | "image" | "link";
export type ProgressStatus = "in_progress" | "completed";

export interface LessonContentRow {
  lesson_id: string;
  video_url: string | null;
  video_sources: unknown;
  allow_download: boolean;
  objectives: string[];
  transcript: string | null;
  duration_minutes: number | null;
}

export interface LessonProgressRow {
  user_id: string;
  lesson_id: string;
  status: ProgressStatus;
  position_seconds: number;
  completed_at: string | null;
  last_accessed_at: string;
}

export interface ResourceRow {
  id: string;
  title: string;
  description: string;
  resource_type: ResourceType;
  course_id: string | null;
  unit_id: string | null;
  lesson_id: string | null;
  topic: string | null;
  external_url: string | null;
  storage_path: string | null;
  body: string | null;
  thumbnail_url: string | null;
  is_published: boolean;
  created_at: string;
}

// ---------------------------------------------------------------
// Phase 3: assessments (Task 3.1)
// Student-readable shapes contain NO answer information. Answer keys and
// explanations live in staff-only tables (question_answer_keys,
// question_correct_options) and must never be selected from student code paths.
// ---------------------------------------------------------------
export type AssessmentStatus = "draft" | "published";
export type QuestionType =
  | "single_choice"
  | "true_false"
  | "multiple_select"
  | "short_answer"
  | "descriptive";

export interface AssessmentRow {
  id: string;
  title: string;
  description: string;
  instructions: string;
  course_id: string;
  unit_id: string | null;
  created_by: string | null;
  status: AssessmentStatus;
  total_marks: number;
  passing_marks: number | null;
  duration_minutes: number | null;
  /** null = unlimited attempts */
  attempt_limit: number | null;
  opens_at: string | null;
  closes_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface QuestionRow {
  id: string;
  assessment_id: string;
  question_type: QuestionType;
  question_text: string;
  image_url: string | null;
  marks: number;
  position: number;
}

export interface QuestionOptionRow {
  id: string;
  question_id: string;
  option_text: string;
  position: number;
}

/** STAFF ONLY (teacher builder, admin). Never send to a student. */
export interface QuestionAnswerKeyRow {
  question_id: string;
  correct_boolean: boolean | null;
  accepted_answers: string[];
  case_sensitive: boolean;
  explanation: string | null;
}

/** STAFF ONLY. */
export interface QuestionCorrectOptionRow {
  question_id: string;
  option_id: string;
}
