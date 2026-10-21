import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { parseVideoUrl } from "@/lib/learning/video";
import { linkKey } from "./links";

export interface ChapterOption {
  unitId: string;
  title: string;
  videoCount: number;
}
export interface CourseChapters {
  courseId: string;
  title: string;
  status: "draft" | "published";
  chapters: ChapterOption[];
}

type Obj = Record<string, unknown>;

/** The teacher's own courses with their chapters (units) and how many videos each has. */
export async function getTeacherChapters(userId: string): Promise<CourseChapters[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("courses")
    .select("id, title, status, units(id, title, position, lessons(id))")
    .eq("created_by", userId)
    .order("title");
  if (error) throw new Error("Could not load your courses.");

  return ((data ?? []) as unknown as Obj[]).map((c) => {
    const units = ((c.units ?? []) as Obj[])
      .slice()
      .sort((a, b) => (a.position as number) - (b.position as number));
    return {
      courseId: c.id as string,
      title: c.title as string,
      status: c.status as "draft" | "published",
      chapters: units.map((u) => ({
        unitId: u.id as string,
        title: u.title as string,
        videoCount: ((u.lessons ?? []) as unknown[]).length,
      })),
    };
  });
}

export interface ChapterVideo {
  lessonId: string;
  title: string;
  position: number;
  isPublished: boolean;
  videoUrl: string | null;
  /** YouTube id or direct-file URL; used to spot duplicates when adding. */
  key: string | null;
  youtubeId: string | null;
  /** Study materials the teacher attached to this lesson. */
  resources: { id: string; title: string; type: "pdf" | "notes" | "presentation" | "image" | "link" }[];
}
export interface ChapterDetail {
  unitId: string;
  title: string;
  courseId: string;
  courseTitle: string;
  courseStatus: "draft" | "published";
  videos: ChapterVideo[];
}

/** One chapter of a course the teacher created, with its videos in order. Null if not theirs. */
export async function getChapterDetail(unitId: string, userId: string): Promise<ChapterDetail | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("units")
    .select(
      "id, title, course:courses(id, title, status, created_by), lessons(id, title, position, is_published, content:lesson_content(video_url), resources(id, title, resource_type, created_at))",
    )
    .eq("id", unitId)
    .maybeSingle();
  if (error || !data) return null;

  const row = data as unknown as Obj;
  const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);
  const course = one(row.course as Obj | Obj[] | null);
  if (!course || course.created_by !== userId) return null;

  const videos = ((row.lessons ?? []) as Obj[])
    .slice()
    .sort((a, b) => (a.position as number) - (b.position as number))
    .map((l): ChapterVideo => {
      const content = one(l.content as Obj | Obj[] | null);
      const videoUrl = (content?.video_url as string | null | undefined) ?? null;
      const source = parseVideoUrl(videoUrl);
      return {
        lessonId: l.id as string,
        title: l.title as string,
        position: l.position as number,
        isPublished: l.is_published as boolean,
        videoUrl,
        key: source ? linkKey(source) : null,
        youtubeId: source?.kind === "youtube" ? source.videoId : null,
        resources: ((l.resources ?? []) as Obj[])
          .slice()
          .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
          .map((r) => ({
            id: r.id as string,
            title: r.title as string,
            type: r.resource_type as ChapterVideo["resources"][number]["type"],
          })),
      };
    });

  return {
    unitId: row.id as string,
    title: row.title as string,
    courseId: course.id as string,
    courseTitle: course.title as string,
    courseStatus: course.status as "draft" | "published",
    videos,
  };
}
