"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { clampPosition } from "@/lib/learning/progress";

export type LearningResult = { ok: true } | { ok: false; error: string };

const uuid = z.string().uuid();
const UNIQUE_VIOLATION = "23505";

async function authedClient() {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return { supabase, userId: user.id };
}

const SIGN_IN_ERROR: LearningResult = { ok: false, error: "Please sign in again to continue." };

/**
 * All actions below validate input with Zod, take the user id from the
 * server-validated session (never from the request), and then rely on RLS as a
 * second, independent check (e.g. you can only record progress for lessons in
 * courses you are enrolled in).
 */

export async function enrollAction(courseId: unknown): Promise<LearningResult> {
  const id = uuid.safeParse(courseId);
  if (!id.success) return { ok: false, error: "Invalid course." };
  const ctx = await authedClient();
  if (!ctx) return SIGN_IN_ERROR;

  const { error } = await ctx.supabase
    .from("enrollments")
    .insert({ user_id: ctx.userId, course_id: id.data });

  // Already enrolled (unique constraint) counts as success, so double clicks are harmless.
  if (error && error.code !== UNIQUE_VIOLATION) {
    return { ok: false, error: "You can't enrol in this course." };
  }
  return { ok: true };
}

export async function unenrollAction(courseId: unknown): Promise<LearningResult> {
  const id = uuid.safeParse(courseId);
  if (!id.success) return { ok: false, error: "Invalid course." };
  const ctx = await authedClient();
  if (!ctx) return SIGN_IN_ERROR;

  const { error } = await ctx.supabase
    .from("enrollments")
    .delete()
    .eq("user_id", ctx.userId)
    .eq("course_id", id.data);
  if (error) return { ok: false, error: "Could not leave the course." };
  return { ok: true };
}

/** Idempotent: completing an already-completed lesson changes nothing. */
export async function markLessonCompleteAction(lessonId: unknown): Promise<LearningResult> {
  const id = uuid.safeParse(lessonId);
  if (!id.success) return { ok: false, error: "Invalid lesson." };
  const ctx = await authedClient();
  if (!ctx) return SIGN_IN_ERROR;

  const { data: existing } = await ctx.supabase
    .from("lesson_progress")
    .select("status")
    .eq("user_id", ctx.userId)
    .eq("lesson_id", id.data)
    .maybeSingle();
  if ((existing as { status: string } | null)?.status === "completed") return { ok: true };

  const now = new Date().toISOString();
  const completedFields = { status: "completed" as const, completed_at: now, last_accessed_at: now };

  // Update-then-insert (not upsert) so only the granted columns are ever written.
  const { data: updated, error: updateError } = await ctx.supabase
    .from("lesson_progress")
    .update(completedFields)
    .eq("user_id", ctx.userId)
    .eq("lesson_id", id.data)
    .select("lesson_id");
  if (updateError) return { ok: false, error: "Enrol in this course to track your progress." };
  if (updated && updated.length > 0) return { ok: true };

  const { error: insertError } = await ctx.supabase
    .from("lesson_progress")
    .insert({ user_id: ctx.userId, lesson_id: id.data, ...completedFields });
  if (insertError) {
    if (insertError.code !== UNIQUE_VIOLATION) {
      return { ok: false, error: "Enrol in this course to track your progress." };
    }
    // Row appeared between the two calls (double click): finish with an update.
    await ctx.supabase
      .from("lesson_progress")
      .update(completedFields)
      .eq("user_id", ctx.userId)
      .eq("lesson_id", id.data);
  }
  return { ok: true };
}

/** Records that the lesson was opened, and the latest video position. Never un-completes a lesson. */
export async function saveLessonPositionAction(lessonId: unknown, positionSeconds: unknown): Promise<LearningResult> {
  const id = uuid.safeParse(lessonId);
  if (!id.success) return { ok: false, error: "Invalid lesson." };
  const position = clampPosition(positionSeconds);
  const ctx = await authedClient();
  if (!ctx) return SIGN_IN_ERROR;

  const now = new Date().toISOString();
  const { data: updated, error: updateError } = await ctx.supabase
    .from("lesson_progress")
    .update({ position_seconds: position, last_accessed_at: now })
    .eq("user_id", ctx.userId)
    .eq("lesson_id", id.data)
    .select("lesson_id");
  if (updateError) return { ok: false, error: "Could not save your position." };
  if (updated && updated.length > 0) return { ok: true };

  const { error: insertError } = await ctx.supabase.from("lesson_progress").insert({
    user_id: ctx.userId,
    lesson_id: id.data,
    status: "in_progress",
    position_seconds: position,
    last_accessed_at: now,
  });
  if (insertError && insertError.code !== UNIQUE_VIOLATION) {
    return { ok: false, error: "Could not save your position." };
  }
  return { ok: true };
}

const bookmarkSchema = z
  .object({
    lessonId: uuid.optional(),
    resourceId: uuid.optional(),
    bookmarked: z.boolean(),
  })
  .refine((v) => Boolean(v.lessonId) !== Boolean(v.resourceId), {
    message: "Choose exactly one item to bookmark.",
  });

/** Sets the desired bookmark state (idempotent, so retries and double clicks are safe). */
export async function setBookmarkAction(input: unknown): Promise<LearningResult> {
  const parsed = bookmarkSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid bookmark." };
  const { lessonId, resourceId, bookmarked } = parsed.data;
  const ctx = await authedClient();
  if (!ctx) return SIGN_IN_ERROR;

  if (!bookmarked) {
    let q = ctx.supabase.from("bookmarks").delete().eq("user_id", ctx.userId);
    q = lessonId ? q.eq("lesson_id", lessonId) : q.eq("resource_id", resourceId as string);
    const { error } = await q;
    return error ? { ok: false, error: "Could not remove the bookmark." } : { ok: true };
  }

  const { error } = await ctx.supabase.from("bookmarks").insert({
    user_id: ctx.userId,
    lesson_id: lessonId ?? null,
    resource_id: resourceId ?? null,
  });
  if (error && error.code !== UNIQUE_VIOLATION) {
    return { ok: false, error: "Could not add the bookmark." };
  }
  return { ok: true };
}

const noteSchema = z.object({ lessonId: uuid, body: z.string().max(5000, "Notes can be up to 5000 characters.") });

export async function saveNoteAction(input: unknown): Promise<LearningResult> {
  const parsed = noteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid note." };
  const ctx = await authedClient();
  if (!ctx) return SIGN_IN_ERROR;

  const body = parsed.data.body.trim();
  if (body.length === 0) {
    const { error } = await ctx.supabase
      .from("lesson_notes")
      .delete()
      .eq("user_id", ctx.userId)
      .eq("lesson_id", parsed.data.lessonId);
    return error ? { ok: false, error: "Could not clear your note." } : { ok: true };
  }

  const { data: updated, error: updateError } = await ctx.supabase
    .from("lesson_notes")
    .update({ body })
    .eq("user_id", ctx.userId)
    .eq("lesson_id", parsed.data.lessonId)
    .select("lesson_id");
  if (updateError) return { ok: false, error: "Could not save your note." };
  if (updated && updated.length > 0) return { ok: true };

  const { error: insertError } = await ctx.supabase
    .from("lesson_notes")
    .insert({ user_id: ctx.userId, lesson_id: parsed.data.lessonId, body });
  if (insertError && insertError.code !== UNIQUE_VIOLATION) {
    return { ok: false, error: "Enrol in this course to save notes." };
  }
  return { ok: true };
}

const profileSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your full name").max(120, "Name is too long"),
});

export async function updateProfileNameAction(input: unknown): Promise<LearningResult> {
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid name." };
  const ctx = await authedClient();
  if (!ctx) return SIGN_IN_ERROR;

  // Only full_name can be written by app users (column privilege); role is untouchable here.
  const { error } = await ctx.supabase
    .from("profiles")
    .update({ full_name: parsed.data.fullName })
    .eq("id", ctx.userId);
  if (error) return { ok: false, error: "Could not update your name." };
  return { ok: true };
}
