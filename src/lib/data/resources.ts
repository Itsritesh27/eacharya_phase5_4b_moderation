import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { RESOURCE_COLUMNS } from "@/lib/data/learning";
import { PAGE_SIZE } from "@/lib/learning/search";
import type { ResourceRow, ResourceType } from "@/types/app";

export interface ResourceFilters {
  q: string;
  grade?: number;
  courseId?: string;
  unitId?: string;
  topic?: string;
  type?: ResourceType;
  sort: "newest" | "title";
  page: number;
}

export type ResourceListItem = ResourceRow & { courseTitle: string | null };

export interface ResourceListResult {
  items: ResourceListItem[];
  total: number;
  page: number;
  pageCount: number;
}

/**
 * Searches published resources visible to the current user (RLS enforced).
 * Free text must already be passed through sanitizeSearch(); ids must be UUIDs.
 */
export async function searchResources(f: ResourceFilters): Promise<ResourceListResult> {
  const empty: ResourceListResult = { items: [], total: 0, page: f.page, pageCount: 1 };
  if (!isSupabaseConfigured()) return empty;
  const supabase = await createClient();

  // Class filter: resolve to the ids of published courses in that class.
  let courseIds: string[] | null = null;
  if (f.courseId) {
    courseIds = [f.courseId];
  } else if (f.grade) {
    const { data: cls } = await supabase.from("classes").select("id").eq("grade", f.grade).maybeSingle();
    if (!cls) return empty;
    const { data: courses } = await supabase
      .from("courses")
      .select("id")
      .eq("class_id", (cls as { id: string }).id)
      .eq("status", "published");
    courseIds = ((courses ?? []) as { id: string }[]).map((c) => c.id);
    if (courseIds.length === 0) return empty;
  }

  let query = supabase
    .from("resources")
    .select(`${RESOURCE_COLUMNS}, course:courses(title)`, { count: "exact" })
    .eq("is_published", true);

  if (courseIds) query = query.in("course_id", courseIds);
  if (f.unitId) query = query.eq("unit_id", f.unitId);
  if (f.topic) query = query.eq("topic", f.topic);
  if (f.type) query = query.eq("resource_type", f.type);
  if (f.q) query = query.or(`title.ilike.%${f.q}%,description.ilike.%${f.q}%`);

  query = f.sort === "title" ? query.order("title", { ascending: true }) : query.order("created_at", { ascending: false });

  const from = (f.page - 1) * PAGE_SIZE;
  const { data, count, error } = await query.range(from, from + PAGE_SIZE - 1);
  if (error) return empty;

  const total = count ?? 0;
  const items = ((data ?? []) as unknown as (ResourceRow & { course: { title: string } | null })[]).map(
    ({ course, ...rest }) => ({ ...rest, courseTitle: course?.title ?? null }),
  );
  return { items, total, page: f.page, pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

export interface ResourceFilterOptions {
  courses: { id: string; title: string }[];
  units: { id: string; title: string }[];
  topics: string[];
}

export async function getResourceFilterOptions(courseId?: string): Promise<ResourceFilterOptions> {
  const empty: ResourceFilterOptions = { courses: [], units: [], topics: [] };
  if (!isSupabaseConfigured()) return empty;
  const supabase = await createClient();

  const [{ data: courses }, { data: units }, { data: topics }] = await Promise.all([
    supabase.from("courses").select("id, title").eq("status", "published").order("title"),
    courseId
      ? supabase.from("units").select("id, title").eq("course_id", courseId).order("position")
      : Promise.resolve({ data: [] as { id: string; title: string }[] }),
    supabase.from("resources").select("topic").eq("is_published", true).not("topic", "is", null).limit(300),
  ]);

  const topicSet = new Set<string>();
  for (const t of (topics ?? []) as { topic: string | null }[]) if (t.topic) topicSet.add(t.topic);

  return {
    courses: (courses ?? []) as { id: string; title: string }[],
    units: (units ?? []) as { id: string; title: string }[],
    topics: [...topicSet].sort((a, b) => a.localeCompare(b)),
  };
}

export async function getBookmarkedResourceIds(userId: string, ids: string[]): Promise<Set<string>> {
  if (!isSupabaseConfigured() || ids.length === 0) return new Set();
  const supabase = await createClient();
  const { data } = await supabase
    .from("bookmarks")
    .select("resource_id")
    .eq("user_id", userId)
    .in("resource_id", ids);
  return new Set(((data ?? []) as { resource_id: string }[]).map((r) => r.resource_id));
}
