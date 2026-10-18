"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { parseVideoUrl } from "@/lib/learning/video";
import {
  MAX_BATCH,
  MAX_TITLE,
  canonicalUrl,
  cleanTitle,
  linkKey,
  titleFromFilename,
  youtubeThumbnail,
} from "./links";
import { fetchYoutubeMeta } from "./youtube-meta";

const uuid = z.string().uuid();
const GENERIC = "Something went wrong while saving. Please try again.";
const NO_ACCESS = { ok: false as const, error: "Please sign in with a teacher account to continue." };
const NOT_YOURS = {
  ok: false as const,
  error: "This chapter was not found, or it is not in one of your courses.",
};

/**
 * Same rules as every other teacher action: Zod-validated input, user id from the
 * server-validated session, teacher role required, ownership checked here and then
 * enforced again by RLS. No service-role access.
 */
async function teacherContext() {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if ((data as { role?: string } | null)?.role !== "teacher") return null;
  return { supabase, userId: user.id };
}

export interface VideoPreview {
  url: string;
  kind: "youtube" | "direct";
  /** Title found automatically; null means the teacher must type one. */
  title: string | null;
  /** Suggested title for direct files (taken from the file name). */
  fallbackTitle: string;
  author: string | null;
  thumbnail: string | null;
}

export type PreviewResult = { ok: true; previews: VideoPreview[] } | { ok: false; error: string };

/** Step 1: teacher pastes links -> we look up the YouTube titles. Nothing is saved. */
export async function previewVideosAction(urls: unknown): Promise<PreviewResult> {
  const parsed = z.array(z.string().max(500)).min(1).max(MAX_BATCH).safeParse(urls);
  if (!parsed.success) return { ok: false, error: `Paste between 1 and ${MAX_BATCH} links at a time.` };
  const ctx = await teacherContext();
  if (!ctx) return NO_ACCESS;

  const previews = await Promise.all(
    parsed.data.map(async (raw): Promise<VideoPreview | null> => {
      const source = parseVideoUrl(raw);
      if (!source) return null;
      if (source.kind === "youtube") {
        const meta = await fetchYoutubeMeta(source.videoId);
        return {
          url: canonicalUrl(source),
          kind: "youtube",
          title: meta?.title ?? null,
          fallbackTitle: "",
          author: meta?.author ?? null,
          thumbnail: youtubeThumbnail(source.videoId),
        };
      }
      return {
        url: canonicalUrl(source),
        kind: "direct",
        title: null,
        fallbackTitle: titleFromFilename(source.src),
        author: null,
        thumbnail: null,
      };
    }),
  );
  return { ok: true, previews: previews.filter((p): p is VideoPreview => p !== null) };
}

const addSchema = z.object({
  unitId: uuid,
  publish: z.boolean(),
  items: z
    .array(z.object({ url: z.string().max(500), title: z.string().max(1000) }))
    .min(1)
    .max(MAX_BATCH),
});

export type AddResult =
  | { ok: true; added: number; skipped: number }
  | { ok: false; error: string };

/**
 * Step 2: save every video as its own lesson at the end of the chapter, in the order
 * pasted. URLs are re-validated here; the browser's copy is never trusted.
 */
export async function addVideosAction(input: unknown): Promise<AddResult> {
  const parsed = addSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Please check the links and titles and try again." };
  const ctx = await teacherContext();
  if (!ctx) return NO_ACCESS;
  const { unitId, publish } = parsed.data;

  const owned = await ownedDraftUnit(ctx, unitId);
  if (!owned.ok) return owned;

  const existing = await ctx.supabase
    .from("lessons")
    .select("position, content:lesson_content(video_url)")
    .eq("unit_id", unitId);
  if (existing.error) return { ok: false, error: GENERIC };

  type Existing = { position: number; content: { video_url: string | null } | { video_url: string | null }[] | null };
  const rows = (existing.data ?? []) as unknown as Existing[];
  const have = new Set<string>();
  let nextPosition = 0;
  for (const r of rows) {
    nextPosition = Math.max(nextPosition, r.position + 1);
    const c = Array.isArray(r.content) ? r.content[0] : r.content;
    const s = parseVideoUrl(c?.video_url);
    if (s) have.add(linkKey(s));
  }

  const toAdd: { url: string; title: string }[] = [];
  let skipped = 0;
  for (const item of parsed.data.items) {
    const source = parseVideoUrl(item.url);
    const title = cleanTitle(item.title);
    if (!source || !title) return { ok: false, error: "Every video needs a valid link and a title." };
    const key = linkKey(source);
    if (have.has(key)) {
      skipped += 1;
      continue;
    }
    have.add(key);
    toAdd.push({ url: canonicalUrl(source), title });
  }
  if (toAdd.length === 0) return { ok: true, added: 0, skipped };

  const inserted = await ctx.supabase
    .from("lessons")
    .insert(
      toAdd.map((v, i) => ({
        unit_id: unitId,
        title: v.title.slice(0, MAX_TITLE),
        description: "",
        position: nextPosition + i,
        is_published: publish,
      })),
    )
    .select("id, position");
  if (inserted.error || !inserted.data) return { ok: false, error: GENERIC };

  const created = (inserted.data as { id: string; position: number }[])
    .slice()
    .sort((a, b) => a.position - b.position);

  const content = await ctx.supabase
    .from("lesson_content")
    .insert(created.map((l, i) => ({ lesson_id: l.id, video_url: toAdd[i]!.url })));
  if (content.error) {
    // Do not leave title-only lessons behind: remove what was just created.
    await ctx.supabase
      .from("lessons")
      .delete()
      .in(
        "id",
        created.map((l) => l.id),
      );
    return { ok: false, error: GENERIC };
  }

  revalidatePath(`/dashboard/teacher/videos/${unitId}`);
  revalidatePath("/dashboard/teacher/videos");
  return { ok: true, added: created.length, skipped };
}

const renameSchema = z.object({ lessonId: uuid, unitId: uuid, title: z.string().max(1000) });

export async function renameVideoAction(input: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = renameSchema.safeParse(input);
  const title = parsed.success ? cleanTitle(parsed.data.title) : "";
  if (!parsed.success || !title) return { ok: false, error: "Please enter a title." };
  const ctx = await teacherContext();
  if (!ctx) return NO_ACCESS;

  const { data, error } = await ctx.supabase
    .from("lessons")
    .update({ title })
    .eq("id", parsed.data.lessonId)
    .eq("unit_id", parsed.data.unitId)
    .select("id");
  if (error || !data || data.length === 0) {
    return { ok: false, error: "Could not rename this video. It may be in a published course." };
  }
  revalidatePath(`/dashboard/teacher/videos/${parsed.data.unitId}`);
  return { ok: true };
}

const removeSchema = z.object({ lessonId: uuid, unitId: uuid });

/** Removes the lesson (its video link goes with it, along with students' saved progress on it). */
export async function removeVideoAction(input: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = removeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid video." };
  const ctx = await teacherContext();
  if (!ctx) return NO_ACCESS;

  const { data, error } = await ctx.supabase
    .from("lessons")
    .delete()
    .eq("id", parsed.data.lessonId)
    .eq("unit_id", parsed.data.unitId)
    .select("id");
  if (error || !data || data.length === 0) {
    return { ok: false, error: "Could not remove this video. It may be in a published course." };
  }
  revalidatePath(`/dashboard/teacher/videos/${parsed.data.unitId}`);
  revalidatePath("/dashboard/teacher/videos");
  return { ok: true };
}

async function ownedDraftUnit(ctx: NonNullable<Awaited<ReturnType<typeof teacherContext>>>, unitId: string) {
  const { data } = await ctx.supabase
    .from("units")
    .select("id, course:courses(created_by, status)")
    .eq("id", unitId)
    .maybeSingle();
  const row = data as unknown as {
    course: { created_by: string | null; status: string } | { created_by: string | null; status: string }[] | null;
  } | null;
  const course = Array.isArray(row?.course) ? row?.course[0] : row?.course;
  if (!row || !course || course.created_by !== ctx.userId) return NOT_YOURS;
  if (course.status !== "draft") {
    return {
      ok: false as const,
      error: "This course is published, so its lessons are locked. Ask an administrator to unpublish it to add videos.",
    };
  }
  return { ok: true as const };
}
