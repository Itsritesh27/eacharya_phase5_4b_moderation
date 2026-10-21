import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import type { AssessmentStatus, QuestionType } from "@/types/app";
import type {
  AssessmentListItem,
  CourseOption,
  EditorAssessment,
  EditorQuestion,
  Snapshot,
} from "./types";

/**
 * Teacher-side reads. Everything runs as the signed-in user, so RLS applies.
 * RLS alone is not enough for a teacher-only screen: a teacher who is also
 * enrolled in someone else's published course could read that assessment, so
 * every loader here also checks courses.created_by against the caller.
 *
 * Answer keys are only ever selected here, for staff screens.
 */

type Row = Record<string, unknown>;

function one<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

export async function getTeacherCourses(userId: string): Promise<CourseOption[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("courses")
    .select("id, title, class:classes(grade), units(id, title, position)")
    .eq("created_by", userId)
    .order("title");
  if (error) throw new Error("Could not load your courses.");
  return ((data ?? []) as unknown as Row[]).map((c) => {
    const cls = one(c.class as { grade: number } | { grade: number }[] | null);
    const units = ((c.units ?? []) as { id: string; title: string; position: number }[])
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((u) => ({ id: u.id, title: u.title }));
    return { id: c.id as string, title: c.title as string, grade: cls?.grade ?? null, units };
  });
}

export async function listTeacherAssessments(userId: string): Promise<AssessmentListItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("assessments")
    .select(
      "id, title, status, total_marks, duration_minutes, closes_at, updated_at, course:courses!inner(title, created_by, class:classes(grade)), questions(count)",
    )
    .eq("course.created_by", userId)
    .order("updated_at", { ascending: false });
  if (error) throw new Error("Could not load your assessments.");

  return ((data ?? []) as unknown as Row[]).map((a) => {
    const course = one(a.course as Row | Row[] | null);
    const cls = one((course?.class ?? null) as { grade: number } | { grade: number }[] | null);
    const count = one((a.questions ?? null) as { count: number }[] | null);
    return {
      id: a.id as string,
      title: a.title as string,
      status: a.status as AssessmentStatus,
      totalMarks: Number(a.total_marks),
      durationMinutes: (a.duration_minutes as number | null) ?? null,
      closesAt: (a.closes_at as string | null) ?? null,
      updatedAt: a.updated_at as string,
      courseTitle: (course?.title as string | undefined) ?? "",
      grade: cls?.grade ?? null,
      questionCount: count?.count ?? 0,
    };
  });
}

/** The assessment only if it sits in a course this teacher created. */
export async function fetchOwnedAssessment(
  supabase: SupabaseClient,
  assessmentId: string,
  userId: string,
): Promise<EditorAssessment | null> {
  const { data, error } = await supabase
    .from("assessments")
    .select(
      "id, title, description, instructions, course_id, unit_id, status, total_marks, passing_marks, duration_minutes, attempt_limit, opens_at, closes_at, updated_at, course:courses!inner(title, created_by, class:classes(grade))",
    )
    .eq("id", assessmentId)
    .maybeSingle();
  if (error) throw new Error("Could not load the assessment.");
  if (!data) return null;

  const a = data as unknown as Row;
  const course = one(a.course as Row | Row[] | null);
  if (!course || course.created_by !== userId) return null;
  const cls = one((course.class ?? null) as { grade: number } | { grade: number }[] | null);

  return {
    id: a.id as string,
    title: a.title as string,
    description: a.description as string,
    instructions: a.instructions as string,
    courseId: a.course_id as string,
    courseTitle: course.title as string,
    grade: cls?.grade ?? null,
    unitId: (a.unit_id as string | null) ?? null,
    status: a.status as AssessmentStatus,
    totalMarks: Number(a.total_marks),
    passingMarks: a.passing_marks === null ? null : Number(a.passing_marks),
    durationMinutes: (a.duration_minutes as number | null) ?? null,
    attemptLimit: (a.attempt_limit as number | null) ?? null,
    opensAt: (a.opens_at as string | null) ?? null,
    closesAt: (a.closes_at as string | null) ?? null,
    updatedAt: a.updated_at as string,
  };
}

/** Questions with options and the answer key, in order. STAFF ONLY. */
export async function loadEditorQuestions(
  supabase: SupabaseClient,
  assessmentId: string,
): Promise<EditorQuestion[]> {
  const { data, error } = await supabase
    .from("questions")
    .select("id, question_type, question_text, marks, position, options:question_options(id, option_text, position)")
    .eq("assessment_id", assessmentId)
    .order("position", { ascending: true });
  if (error) throw new Error("Could not load the questions.");

  const rows = (data ?? []) as unknown as Row[];
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id as string);

  const [keys, correct] = await Promise.all([
    supabase
      .from("question_answer_keys")
      .select("question_id, correct_boolean, accepted_answers, case_sensitive, explanation")
      .in("question_id", ids),
    supabase.from("question_correct_options").select("question_id, option_id").in("question_id", ids),
  ]);
  if (keys.error || correct.error) throw new Error("Could not load the answer keys.");

  const keyByQ = new Map(
    ((keys.data ?? []) as Row[]).map((k) => [k.question_id as string, k] as const),
  );
  const correctIds = new Set(((correct.data ?? []) as Row[]).map((c) => c.option_id as string));

  return rows.map((r) => {
    const key = keyByQ.get(r.id as string);
    const options = ((r.options ?? []) as { id: string; option_text: string; position: number }[])
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((o) => ({ id: o.id, text: o.option_text, isCorrect: correctIds.has(o.id) }));
    return {
      id: r.id as string,
      type: r.question_type as QuestionType,
      text: r.question_text as string,
      marks: Number(r.marks),
      position: r.position as number,
      options,
      correctBoolean: (key?.correct_boolean as boolean | null | undefined) ?? null,
      acceptedAnswers: (key?.accepted_answers as string[] | undefined) ?? [],
      caseSensitive: (key?.case_sensitive as boolean | undefined) ?? false,
      explanation: (key?.explanation as string | null | undefined) ?? "",
    };
  });
}

export async function loadSnapshot(supabase: SupabaseClient, assessmentId: string): Promise<Snapshot> {
  const [questions, head] = await Promise.all([
    loadEditorQuestions(supabase, assessmentId),
    supabase.from("assessments").select("total_marks, passing_marks").eq("id", assessmentId).single(),
  ]);
  if (head.error || !head.data) throw new Error("Could not load the assessment.");
  const h = head.data as Row;
  return {
    questions,
    totalMarks: Number(h.total_marks),
    passingMarks: h.passing_marks === null ? null : Number(h.passing_marks),
  };
}
