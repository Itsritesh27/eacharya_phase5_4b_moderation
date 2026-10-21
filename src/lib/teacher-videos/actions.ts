"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseEnv, isSupabaseConfigured } from "@/lib/supabase/env";
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
import { MAX_DOWNLOADS_PER_VIDEO, isOwnUploadUrl } from "./uploads";
import { MAX_RESOURCES_PER_LESSON, RESOURCE_BUCKET, isOwnResourcePath, resourceKind } from "./resource-files";

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

const downloadSchema = z.object({
  url: z.string().max(500),
  label: z.string().max(12),
  height: z.number().int().min(0).max(4320),
});

const resourceItemSchema = z.object({ path: z.string().max(500), title: z.string().max(1000) });

const addSchema = z.object({
  unitId: uuid,
  publish: z.boolean(),
  /** Whether students may download the video files attached to these lessons. */
  allowDownload: z.boolean().default(true),
  items: z
    .array(
      z.object({
        url: z.string().max(500),
        title: z.string().max(1000),
        /** Files the teacher uploaded from the dashboard for students to download. */
        downloads: z.array(downloadSchema).max(MAX_DOWNLOADS_PER_VIDEO).default([]),
        /** Study materials (PDF, slides, images) already uploaded to the private bucket. */
        resources: z.array(resourceItemSchema).max(MAX_RESOURCES_PER_LESSON).default([]),
      }),
    )
    .min(1)
    .max(MAX_BATCH),
});

export type AddResult =
  | { ok: true; added: number; skipped: number; resourcesFailed?: number }
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
  const { unitId, publish, allowDownload } = parsed.data;
  const env = getSupabaseEnv();
  if (!env) return { ok: false, error: GENERIC };

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

  const toAdd: {
    url: string;
    title: string;
    sources: { url: string; label: string; height: number }[];
    resources: { path: string; title: string }[];
  }[] = [];
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

    // Attached downloads must be video files in THIS teacher's own folder of our bucket.
    const sources: { url: string; label: string; height: number }[] = [];
    const seenFiles = new Set<string>();
    for (const d of item.downloads) {
      const file = parseVideoUrl(d.url);
      if (!file || file.kind !== "direct" || !isOwnUploadUrl(file.src, env.url, ctx.userId)) {
        return { ok: false, error: "One of the uploaded download files is not valid. Please upload it again." };
      }
      if (seenFiles.has(file.src)) continue;
      seenFiles.add(file.src);
      sources.push({ url: file.src, label: d.label.trim().slice(0, 12) || "Original", height: d.height });
    }
    const checked = checkResourceItems(item.resources, ctx.userId);
    if (!checked.ok) return checked;
    toAdd.push({ url: canonicalUrl(source), title, sources, resources: checked.items });
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
    .insert(
      created.map((l, i) => ({
        lesson_id: l.id,
        video_url: toAdd[i]!.url,
        video_sources: toAdd[i]!.sources,
        allow_download: allowDownload,
      })),
    );
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

  let resourcesFailed = 0;
  for (let i = 0; i < created.length; i++) {
    const items = toAdd[i]!.resources;
    if (items.length === 0) continue;
    const r = await insertLessonResources(ctx, {
      courseId: owned.courseId,
      unitId,
      lessonId: created[i]!.id,
      items,
    });
    if (!r.ok) resourcesFailed += items.length;
  }

  revalidatePath(`/dashboard/teacher/videos/${unitId}`);
  revalidatePath("/dashboard/teacher/videos");
  return { ok: true, added: created.length, skipped, ...(resourcesFailed > 0 ? { resourcesFailed } : {}) };
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

async function ownedDraftUnit(ctx: Ctx, unitId: string) {
  const { data } = await ctx.supabase
    .from("units")
    .select("id, course:courses(id, created_by, status)")
    .eq("id", unitId)
    .maybeSingle();
  const row = data as unknown as {
    course:
      | { id: string; created_by: string | null; status: string }
      | { id: string; created_by: string | null; status: string }[]
      | null;
  } | null;
  const course = Array.isArray(row?.course) ? row?.course[0] : row?.course;
  if (!row || !course || course.created_by !== ctx.userId) return NOT_YOURS;
  // Teachers may edit their own course whether it is draft or published.
  return { ok: true as const, courseId: course.id };
}

type Ctx = NonNullable<Awaited<ReturnType<typeof teacherContext>>>;

/** Validates uploaded study-material paths: own folder only, supported types, readable titles. */
function checkResourceItems(
  items: { path: string; title: string }[],
  userId: string,
): { ok: true; items: { path: string; title: string }[] } | { ok: false; error: string } {
  const out: { path: string; title: string }[] = [];
  const seen = new Set<string>();
  for (const it of items) {
    if (!isOwnResourcePath(it.path, userId)) {
      return { ok: false, error: "One of the uploaded study materials is not valid. Please upload it again." };
    }
    if (seen.has(it.path)) continue;
    seen.add(it.path);
    const title = cleanTitle(it.title) || "Study material";
    out.push({ path: it.path, title });
  }
  return { ok: true, items: out };
}

/** Saves the files as published resources of one lesson; students see them in the lesson's Resources tab. */
async function insertLessonResources(
  ctx: Ctx,
  args: { courseId: string; unitId: string; lessonId: string; items: { path: string; title: string }[] },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const rows = args.items.map((it) => ({
    title: it.title.slice(0, 200),
    description: "",
    resource_type: resourceKind(it.path)!.type,
    course_id: args.courseId,
    unit_id: args.unitId,
    lesson_id: args.lessonId,
    storage_path: it.path,
    is_published: true,
    created_by: ctx.userId,
  }));
  const { error } = await ctx.supabase.from("resources").insert(rows);
  if (error) return { ok: false, error: GENERIC };
  return { ok: true };
}

const addResourcesSchema = z.object({
  unitId: uuid,
  lessonId: uuid,
  items: z.array(resourceItemSchema).min(1).max(MAX_RESOURCES_PER_LESSON),
});

/** Attach study materials to a lesson that already exists. */
export async function addLessonResourcesAction(input: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = addResourcesSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Please check the files and try again." };
  const ctx = await teacherContext();
  if (!ctx) return NO_ACCESS;
  const { unitId, lessonId } = parsed.data;

  const owned = await ownedDraftUnit(ctx, unitId);
  if (!owned.ok) return owned;
  const lesson = await ctx.supabase.from("lessons").select("id").eq("id", lessonId).eq("unit_id", unitId).maybeSingle();
  if (lesson.error || !lesson.data) return { ok: false, error: "This video was not found in your chapter." };

  const existing = await ctx.supabase
    .from("resources")
    .select("id", { count: "exact", head: true })
    .eq("lesson_id", lessonId);
  if ((existing.count ?? 0) + parsed.data.items.length > MAX_RESOURCES_PER_LESSON) {
    return { ok: false, error: `A video can have up to ${MAX_RESOURCES_PER_LESSON} study materials.` };
  }

  const checked = checkResourceItems(parsed.data.items, ctx.userId);
  if (!checked.ok) return checked;
  const res = await insertLessonResources(ctx, { courseId: owned.courseId, unitId, lessonId, items: checked.items });
  if (!res.ok) return res;
  revalidatePath(`/dashboard/teacher/videos/${unitId}`);
  revalidatePath(`/tutorials/${lessonId}`);
  return { ok: true };
}

const removeResourceSchema = z.object({ resourceId: uuid, unitId: uuid });

/** Removes a study material the teacher attached (the row and its stored file). */
export async function removeLessonResourceAction(input: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = removeResourceSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid file." };
  const ctx = await teacherContext();
  if (!ctx) return NO_ACCESS;

  const found = await ctx.supabase
    .from("resources")
    .select("id, storage_path, lesson_id")
    .eq("id", parsed.data.resourceId)
    .eq("unit_id", parsed.data.unitId)
    .eq("created_by", ctx.userId)
    .maybeSingle();
  const row = found.data as { id: string; storage_path: string | null; lesson_id: string | null } | null;
  if (found.error || !row) return { ok: false, error: "This file was not found." };

  const { data, error } = await ctx.supabase.from("resources").delete().eq("id", row.id).select("id");
  if (error || !data || data.length === 0) return { ok: false, error: "Could not remove this file." };
  if (row.storage_path && isOwnResourcePath(row.storage_path, ctx.userId)) {
    await ctx.supabase.storage.from(RESOURCE_BUCKET).remove([row.storage_path]);
  }
  revalidatePath(`/dashboard/teacher/videos/${parsed.data.unitId}`);
  if (row.lesson_id) revalidatePath(`/tutorials/${row.lesson_id}`);
  return { ok: true };
}
