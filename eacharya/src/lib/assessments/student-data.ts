import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { availability, type Availability } from "./availability";

/**
 * Student-side reads of assessments. Runs as the signed-in student, so RLS decides
 * what is visible (published, in a published course the student is enrolled in).
 * These queries NEVER touch question_answer_keys or question_correct_options, and
 * select no question text; only a question COUNT, and only inside the open window.
 */

export interface StudentAssessment {
  id: string;
  title: string;
  description: string;
  instructions: string;
  durationMinutes: number | null;
  totalMarks: number;
  attemptLimit: number | null;
  opensAt: string | null;
  closesAt: string | null;
  courseTitle: string;
  grade: number | null;
  unitTitle: string | null;
  availability: Availability;
  /** null until the assessment opens: questions are not readable by students before then. */
  questionCount: number | null;
}

type Row = Record<string, unknown>;

function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}

const SELECT =
  "id, title, description, instructions, duration_minutes, total_marks, attempt_limit, opens_at, closes_at, " +
  "course:courses!inner(title, class:classes(grade)), unit:units(title)";

function toAssessment(r: Row, now: Date): StudentAssessment {
  const course = one(r.course as Row | Row[] | null);
  const cls = one((course?.class ?? null) as { grade: number } | { grade: number }[] | null);
  const unit = one(r.unit as { title: string } | { title: string }[] | null);
  const opensAt = (r.opens_at as string | null) ?? null;
  const closesAt = (r.closes_at as string | null) ?? null;
  return {
    id: r.id as string,
    title: r.title as string,
    description: r.description as string,
    instructions: r.instructions as string,
    durationMinutes: (r.duration_minutes as number | null) ?? null,
    totalMarks: Number(r.total_marks),
    attemptLimit: (r.attempt_limit as number | null) ?? null,
    opensAt,
    closesAt,
    courseTitle: (course?.title as string | undefined) ?? "",
    grade: cls?.grade ?? null,
    unitTitle: unit?.title ?? null,
    availability: availability(opensAt, closesAt, now),
    questionCount: null,
  };
}

export async function listStudentAssessments(): Promise<StudentAssessment[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("assessments")
    .select(SELECT)
    .eq("status", "published")
    .order("closes_at", { ascending: true, nullsFirst: false });
  if (error) throw new Error("Could not load your assessments.");

  const now = new Date();
  const rank = { open: 0, upcoming: 1, closed: 2 } as const;
  return ((data ?? []) as unknown as Row[])
    .map((r) => toAssessment(r, now))
    .sort((a, b) => rank[a.availability] - rank[b.availability]);
}

export async function getStudentAssessment(id: string): Promise<StudentAssessment | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("assessments")
    .select(SELECT)
    .eq("id", id)
    .eq("status", "published")
    .maybeSingle();
  if (error) throw new Error("Could not load the assessment.");
  if (!data) return null;

  const a = toAssessment(data as unknown as Row, new Date());
  if (a.availability === "open") {
    const { count } = await supabase
      .from("questions")
      .select("id", { count: "exact", head: true })
      .eq("assessment_id", id);
    a.questionCount = count ?? 0;
  }
  return a;
}
