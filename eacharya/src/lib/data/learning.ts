import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { COURSE_LIST_SELECT, courseCounts, type CourseWithClass } from "@/lib/data/curriculum";
import { computeCourseProgress, type CourseProgress } from "@/lib/learning/progress";
import type { LessonContentRow, ResourceRow, ResourceType } from "@/types/app";

/**
 * Learning-data reads. Every query runs as the signed-in user, so RLS decides
 * what is visible (own progress/bookmarks/notes, published content only).
 * Failures return empty results so pages show honest empty or error states.
 */

export interface EnrolledCourse {
  course: CourseWithClass;
  unitCount: number;
  lessonCount: number;
  progress: CourseProgress;
}

export async function getCompletedLessonIds(userId: string): Promise<Set<string>> {
  if (!isSupabaseConfigured()) return new Set();
  const supabase = await createClient();
  const { data } = await supabase
    .from("lesson_progress")
    .select("lesson_id")
    .eq("user_id", userId)
    .eq("status", "completed");
  return new Set((data ?? []).map((r) => (r as { lesson_id: string }).lesson_id));
}

export async function getEnrolledCourses(userId: string): Promise<EnrolledCourse[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createClient();

  const { data: enrol } = await supabase
    .from("enrollments")
    .select("course_id, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  const ids = (enrol ?? []).map((e) => (e as { course_id: string }).course_id);
  if (ids.length === 0) return [];

  const [{ data: courses }, completed] = await Promise.all([
    supabase.from("courses").select(COURSE_LIST_SELECT).in("id", ids).eq("status", "published"),
    getCompletedLessonIds(userId),
  ]);

  const byId = new Map(((courses ?? []) as unknown as CourseWithClass[]).map((c) => [c.id, c]));
  const result: EnrolledCourse[] = [];
  for (const id of ids) {
    const course = byId.get(id);
    if (!course) continue; // unpublished since enrolling: hidden by RLS
    const { unitCount, lessonCount, lessonIds } = courseCounts(course);
    result.push({ course, unitCount, lessonCount, progress: computeCourseProgress(lessonIds, completed) });
  }
  return result;
}

export async function getEnrolledCourseIds(userId: string): Promise<Set<string>> {
  if (!isSupabaseConfigured()) return new Set();
  const supabase = await createClient();
  const { data } = await supabase.from("enrollments").select("course_id").eq("user_id", userId);
  return new Set((data ?? []).map((r) => (r as { course_id: string }).course_id));
}

export interface LessonRef {
  lessonId: string;
  lessonTitle: string;
  unitTitle: string;
  courseId: string;
  courseTitle: string;
  courseSlug: string;
}

interface NestedLesson {
  id: string;
  title: string;
  unit: { id: string; title: string; course: { id: string; title: string; slug: string } | null } | null;
}

const NESTED_LESSON = "lesson:lessons(id, title, unit:units(id, title, course:courses(id, title, slug)))";

function toLessonRef(l: NestedLesson | null): LessonRef | null {
  if (!l || !l.unit || !l.unit.course) return null;
  return {
    lessonId: l.id,
    lessonTitle: l.title,
    unitTitle: l.unit.title,
    courseId: l.unit.course.id,
    courseTitle: l.unit.course.title,
    courseSlug: l.unit.course.slug,
  };
}

export interface RecentLesson extends LessonRef {
  status: "in_progress" | "completed";
  lastAccessedAt: string;
}

/** Most recently opened lessons (newest first). */
export async function getRecentLessons(userId: string, limit = 5): Promise<RecentLesson[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("lesson_progress")
    .select(`status, last_accessed_at, ${NESTED_LESSON}`)
    .eq("user_id", userId)
    .order("last_accessed_at", { ascending: false })
    .limit(limit);

  const rows = (data ?? []) as unknown as {
    status: "in_progress" | "completed";
    last_accessed_at: string;
    lesson: NestedLesson | null;
  }[];

  const out: RecentLesson[] = [];
  for (const r of rows) {
    const ref = toLessonRef(r.lesson);
    if (ref) out.push({ ...ref, status: r.status, lastAccessedAt: r.last_accessed_at });
  }
  return out;
}

export interface BookmarkItem {
  id: string;
  createdAt: string;
  lesson: LessonRef | null;
  resource: { id: string; title: string; type: ResourceType } | null;
}

export async function getBookmarks(userId: string, limit = 100): Promise<BookmarkItem[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("bookmarks")
    .select(`id, created_at, ${NESTED_LESSON}, resource:resources(id, title, resource_type)`)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  const rows = (data ?? []) as unknown as {
    id: string;
    created_at: string;
    lesson: NestedLesson | null;
    resource: { id: string; title: string; resource_type: ResourceType } | null;
  }[];

  return rows
    .map((r) => ({
      id: r.id,
      createdAt: r.created_at,
      lesson: toLessonRef(r.lesson),
      resource: r.resource ? { id: r.resource.id, title: r.resource.title, type: r.resource.resource_type } : null,
    }))
    .filter((b) => b.lesson !== null || b.resource !== null);
}

export async function getBookmarkedIds(
  userId: string,
): Promise<{ lessons: Set<string>; resources: Set<string> }> {
  const empty = { lessons: new Set<string>(), resources: new Set<string>() };
  if (!isSupabaseConfigured()) return empty;
  const supabase = await createClient();
  const { data } = await supabase
    .from("bookmarks")
    .select("lesson_id, resource_id")
    .eq("user_id", userId);
  for (const r of (data ?? []) as { lesson_id: string | null; resource_id: string | null }[]) {
    if (r.lesson_id) empty.lessons.add(r.lesson_id);
    if (r.resource_id) empty.resources.add(r.resource_id);
  }
  return empty;
}

export async function getRecentResources(limit = 4): Promise<ResourceRow[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("resources")
    .select(RESOURCE_COLUMNS)
    .eq("is_published", true)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as unknown as ResourceRow[];
}

export const RESOURCE_COLUMNS =
  "id, title, description, resource_type, course_id, unit_id, lesson_id, topic, external_url, storage_path, body, thumbnail_url, is_published, created_at";

// ---------------------------------------------------------------
// Lesson page data
// ---------------------------------------------------------------

export interface LessonPageData {
  lesson: { id: string; title: string; description: string; position: number; unitId: string };
  unit: { id: string; title: string };
  course: { id: string; title: string; slug: string; gradeLabel: string };
  /** Whole course outline in reading order (published lessons only). */
  outline: { unitId: string; unitTitle: string; lessons: { id: string; title: string }[] }[];
  flat: { id: string; title: string }[];
  content: LessonContentRow | null;
  progress: { status: "in_progress" | "completed"; positionSeconds: number } | null;
  note: string;
  bookmarked: boolean;
  enrolled: boolean;
  resources: ResourceRow[];
  completedIds: Set<string>;
}

export async function getLessonPageData(lessonId: string, userId: string): Promise<LessonPageData | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();

  const { data: lessonRow } = await supabase
    .from("lessons")
    .select(
      "id, title, description, position, unit_id, unit:units(id, title, course:courses(id, title, slug, class:classes(name)))",
    )
    .eq("id", lessonId)
    .maybeSingle();
  if (!lessonRow) return null;

  const l = lessonRow as unknown as {
    id: string;
    title: string;
    description: string;
    position: number;
    unit_id: string;
    unit: {
      id: string;
      title: string;
      course: { id: string; title: string; slug: string; class: { name: string } | null } | null;
    } | null;
  };
  if (!l.unit || !l.unit.course) return null;
  const course = l.unit.course;

  const [{ data: units }, enrolledIds, completedIds, { data: content }, { data: prog }, { data: note }, { data: bm }, { data: res }] =
    await Promise.all([
      supabase
        .from("units")
        .select("id, title, position, lessons(id, title, position, is_published)")
        .eq("course_id", course.id)
        .order("position"),
      getEnrolledCourseIds(userId),
      getCompletedLessonIds(userId),
      supabase
        .from("lesson_content")
        .select("lesson_id, video_url, video_sources, allow_download, objectives, transcript, duration_minutes")
        .eq("lesson_id", lessonId)
        .maybeSingle(),
      supabase
        .from("lesson_progress")
        .select("status, position_seconds")
        .eq("user_id", userId)
        .eq("lesson_id", lessonId)
        .maybeSingle(),
      supabase.from("lesson_notes").select("body").eq("user_id", userId).eq("lesson_id", lessonId).maybeSingle(),
      supabase.from("bookmarks").select("id").eq("user_id", userId).eq("lesson_id", lessonId).maybeSingle(),
      supabase
        .from("resources")
        .select(RESOURCE_COLUMNS)
        .eq("is_published", true)
        .eq("course_id", course.id)
        .or(`lesson_id.eq.${lessonId},unit_id.eq.${l.unit_id},and(lesson_id.is.null,unit_id.is.null)`)
        .order("created_at", { ascending: false })
        .limit(12),
    ]);

  const outline = ((units ?? []) as unknown as {
    id: string;
    title: string;
    position: number;
    lessons: { id: string; title: string; position: number; is_published: boolean }[];
  }[]).map((u) => ({
    unitId: u.id,
    unitTitle: u.title,
    lessons: u.lessons
      .filter((x) => x.is_published)
      .sort((a, b) => a.position - b.position)
      .map((x) => ({ id: x.id, title: x.title })),
  }));

  return {
    lesson: { id: l.id, title: l.title, description: l.description, position: l.position, unitId: l.unit_id },
    unit: { id: l.unit.id, title: l.unit.title },
    course: { id: course.id, title: course.title, slug: course.slug, gradeLabel: course.class?.name ?? "" },
    outline,
    flat: outline.flatMap((u) => u.lessons),
    content: (content as LessonContentRow | null) ?? null,
    progress: prog
      ? {
          status: (prog as { status: "in_progress" | "completed" }).status,
          positionSeconds: (prog as { position_seconds: number }).position_seconds,
        }
      : null,
    note: (note as { body: string } | null)?.body ?? "",
    bookmarked: Boolean(bm),
    enrolled: enrolledIds.has(course.id),
    resources: (res ?? []) as unknown as ResourceRow[],
    completedIds,
  };
}

// ---------------------------------------------------------------
// e-Tutorial index: Class -> Course -> Unit -> Lesson
// ---------------------------------------------------------------

export interface TutorialCourse {
  id: string;
  title: string;
  slug: string;
  enrolled: boolean;
  progress: CourseProgress;
  units: { id: string; title: string; lessons: { id: string; title: string }[] }[];
}

export interface TutorialClassGroup {
  grade: number;
  name: string;
  courses: TutorialCourse[];
}

export async function getTutorialTree(userId: string): Promise<TutorialClassGroup[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createClient();

  const [{ data }, enrolledIds, completed] = await Promise.all([
    supabase
      .from("courses")
      .select(
        "id, title, slug, class:classes!inner(grade, name), units(id, title, position, lessons(id, title, position, is_published))",
      )
      .eq("status", "published")
      .order("title"),
    getEnrolledCourseIds(userId),
    getCompletedLessonIds(userId),
  ]);

  const rows = (data ?? []) as unknown as {
    id: string;
    title: string;
    slug: string;
    class: { grade: number; name: string };
    units: {
      id: string;
      title: string;
      position: number;
      lessons: { id: string; title: string; position: number; is_published: boolean }[];
    }[];
  }[];

  const groups = new Map<number, TutorialClassGroup>();
  for (const c of rows) {
    const units = [...c.units]
      .sort((a, b) => a.position - b.position)
      .map((u) => ({
        id: u.id,
        title: u.title,
        lessons: u.lessons
          .filter((l) => l.is_published)
          .sort((a, b) => a.position - b.position)
          .map((l) => ({ id: l.id, title: l.title })),
      }));
    const lessonIds = units.flatMap((u) => u.lessons.map((l) => l.id));
    const course: TutorialCourse = {
      id: c.id,
      title: c.title,
      slug: c.slug,
      enrolled: enrolledIds.has(c.id),
      progress: computeCourseProgress(lessonIds, completed),
      units,
    };
    const group = groups.get(c.class.grade) ?? { grade: c.class.grade, name: c.class.name, courses: [] };
    group.courses.push(course);
    groups.set(c.class.grade, group);
  }
  return [...groups.values()].sort((a, b) => a.grade - b.grade);
}
