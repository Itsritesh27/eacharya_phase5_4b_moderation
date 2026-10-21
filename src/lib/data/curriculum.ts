import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import type { ClassRow, CourseRow, LessonRow, UnitRow } from "@/types/app";

/**
 * Read helpers. All queries run as the current user (or anon), so RLS decides
 * what is visible. These functions return empty results on any failure so pages
 * can show honest empty states instead of crashing.
 */

export async function getActiveClasses(): Promise<ClassRow[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("classes")
    .select("id, grade, name, description, is_active")
    .eq("is_active", true)
    .order("grade", { ascending: true });
  return (data ?? []) as ClassRow[];
}

export type CourseWithClass = CourseRow & {
  class: Pick<ClassRow, "grade" | "name"> | null;
  subject?: { name: string } | null;
  units?: { id: string; lessons: { id: string; is_published: boolean }[] }[];
};

/** Counts of units and PUBLISHED lessons for a course loaded with nested units/lessons. */
export function courseCounts(course: CourseWithClass) {
  const units = course.units ?? [];
  const lessonIds = units.flatMap((u) => u.lessons.filter((l) => l.is_published).map((l) => l.id));
  return { unitCount: units.length, lessonCount: lessonIds.length, lessonIds };
}

export const COURSE_LIST_SELECT =
  "id, title, slug, description, class_id, subject_id, thumbnail_url, status, created_by, created_at, updated_at, class:classes!inner(grade, name), subject:subjects(name), units(id, lessons(id, is_published))";

export async function getPublishedCourses(grade?: number): Promise<CourseWithClass[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createClient();

  let query = supabase
    .from("courses")
    .select(COURSE_LIST_SELECT)
    .eq("status", "published")
    .order("title");
  if (grade) query = query.eq("class.grade", grade);

  const { data } = await query;
  return (data ?? []) as unknown as CourseWithClass[];
}

export interface CourseDetail {
  course: CourseWithClass;
  units: (UnitRow & { lessons: LessonRow[] })[];
}

export async function getPublishedCourseBySlug(slug: string): Promise<CourseDetail | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();

  const { data: course } = await supabase
    .from("courses")
    .select(
      "id, title, slug, description, class_id, subject_id, thumbnail_url, status, created_by, created_at, updated_at, class:classes(grade, name), subject:subjects(name)",
    )
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();
  if (!course) return null;

  const courseRow = course as unknown as CourseWithClass;

  const { data: units } = await supabase
    .from("units")
    .select("id, course_id, title, description, position")
    .eq("course_id", courseRow.id)
    .order("position");

  const unitRows = (units ?? []) as UnitRow[];
  const unitIds = unitRows.map((u) => u.id);

  let lessonRows: LessonRow[] = [];
  if (unitIds.length > 0) {
    const { data: lessons } = await supabase
      .from("lessons")
      .select("id, unit_id, title, description, position, is_published")
      .in("unit_id", unitIds)
      .eq("is_published", true)
      .order("position");
    lessonRows = (lessons ?? []) as LessonRow[];
  }

  return {
    course: courseRow,
    units: unitRows.map((u) => ({ ...u, lessons: lessonRows.filter((l) => l.unit_id === u.id) })),
  };
}
