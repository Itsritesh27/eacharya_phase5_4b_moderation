"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { isMissingSchema } from "./data";
import type { ForumResult } from "./types";

export type LikeResult = ForumResult<{ liked: boolean; likeCount: number | null }>;
import {
  createDiscussionSchema,
  createReplySchema,
  createReportSchema,
  fieldErrorsFrom,
  idSchema,
  setDiscussionBookmarkSchema,
  setDiscussionLikeSchema,
  setReplyLikeSchema,
  updateDiscussionSchema,
  updateReplySchema,
} from "./validation";

const GENERIC = "Something went wrong. Please try again.";
const SIGN_IN = "Please sign in again to continue.";
const UNIQUE_VIOLATION = "23505";

/**
 * Every action: validates input with Zod (unknown keys are dropped), takes the user id ONLY from the
 * server-validated session (never from the request), and then relies on RLS plus database constraints and
 * triggers as an independent second check. Updates and deletes also filter on author_id and verify that a
 * row was actually changed, because RLS reports a denied update as "0 rows", not as an error.
 * No service-role key is used anywhere.
 */
async function authed() {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  return { supabase, userId: user.id };
}

interface DbError { code?: string; message?: string }

/** Plain-language database messages (errcode 23514 from our own trigger) are safe to show; raw ones are not. */
function friendly(error: DbError, fallback = GENERIC): string {
  if (isMissingSchema(error)) return "The forum is not available yet. Please try again later.";
  if (error.code === "23514" && error.message && !/violates check constraint/i.test(error.message)) return error.message;
  if (error.code === "23514") return "Please check the text you entered and try again.";
  if (error.code === "23503") return "This discussion no longer exists.";
  if (error.code === "42501") return "You do not have permission to do that.";
  return fallback;
}

export async function createDiscussionAction(input: unknown): Promise<ForumResult<{ id: string }>> {
  const parsed = createDiscussionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error) };
  const ctx = await authed();
  if (!ctx) return { ok: false, error: SIGN_IN };

  const d = parsed.data;
  const { data, error } = await ctx.supabase
    .from("discussions")
    .insert({
      author_id: ctx.userId, // from the session, never from the request
      grade: d.grade, category: d.category, title: d.title, body: d.body, links: d.links, client_token: d.clientToken,
    })
    .select("id")
    .single();

  if (error?.code === UNIQUE_VIOLATION) {
    // Same submission token again (double click, retry after a slow response): return the original post.
    const { data: existing } = await ctx.supabase
      .from("discussions").select("id").eq("author_id", ctx.userId).eq("client_token", d.clientToken).maybeSingle();
    if (existing) return { ok: true, id: (existing as { id: string }).id };
    return { ok: false, error: GENERIC };
  }
  if (error || !data) return { ok: false, error: friendly(error ?? {}, "Your discussion could not be saved. Please try again.") };

  revalidatePath("/forum");
  return { ok: true, id: (data as { id: string }).id };
}

export async function createReplyAction(input: unknown): Promise<ForumResult<{ id: string }>> {
  const parsed = createReplySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error) };
  const ctx = await authed();
  if (!ctx) return { ok: false, error: SIGN_IN };

  const d = parsed.data;
  const { data, error } = await ctx.supabase
    .from("discussion_replies")
    .insert({ author_id: ctx.userId, discussion_id: d.discussionId, body: d.body, client_token: d.clientToken })
    .select("id")
    .single();

  if (error?.code === UNIQUE_VIOLATION) {
    const { data: existing } = await ctx.supabase
      .from("discussion_replies").select("id").eq("author_id", ctx.userId).eq("client_token", d.clientToken).maybeSingle();
    if (existing) {
      revalidatePath(`/forum/${d.discussionId}`);
      return { ok: true, id: (existing as { id: string }).id };
    }
    return { ok: false, error: GENERIC };
  }
  if (error || !data) {
    const msg = error?.code === "42501" ? "You can't reply to this discussion." : friendly(error ?? {}, "Your reply could not be saved. Please try again.");
    return { ok: false, error: msg };
  }

  revalidatePath(`/forum/${d.discussionId}`);
  revalidatePath("/forum");
  return { ok: true, id: (data as { id: string }).id };
}

export async function updateDiscussionAction(input: unknown): Promise<ForumResult> {
  const parsed = updateDiscussionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error) };
  const ctx = await authed();
  if (!ctx) return { ok: false, error: SIGN_IN };

  const d = parsed.data;
  const { data, error } = await ctx.supabase
    .from("discussions")
    .update({ title: d.title, body: d.body, links: d.links })
    .eq("id", d.id)
    .eq("author_id", ctx.userId)
    .select("id");
  if (error) return { ok: false, error: friendly(error) };
  if (!data || data.length === 0) return { ok: false, error: "You can only edit your own discussions." };

  revalidatePath(`/forum/${d.id}`);
  revalidatePath("/forum");
  return { ok: true };
}

export async function deleteDiscussionAction(id: unknown): Promise<ForumResult> {
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return { ok: false, error: "Invalid discussion." };
  const ctx = await authed();
  if (!ctx) return { ok: false, error: SIGN_IN };

  // The database trigger refuses this once anyone has replied, even if a reply arrives a moment ago.
  const { data, error } = await ctx.supabase
    .from("discussions").delete().eq("id", parsed.data).eq("author_id", ctx.userId).select("id");
  if (error) return { ok: false, error: friendly(error) };
  if (!data || data.length === 0) return { ok: false, error: "This discussion could not be deleted. It may already be gone, or it is not yours." };

  revalidatePath("/forum");
  return { ok: true };
}

export async function updateReplyAction(input: unknown): Promise<ForumResult> {
  const parsed = updateReplySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error) };
  const ctx = await authed();
  if (!ctx) return { ok: false, error: SIGN_IN };

  const { data, error } = await ctx.supabase
    .from("discussion_replies")
    .update({ body: parsed.data.body })
    .eq("id", parsed.data.id)
    .eq("author_id", ctx.userId)
    .select("id, discussion_id");
  if (error) return { ok: false, error: friendly(error) };
  const row = (data as { discussion_id: string }[] | null)?.[0];
  if (!row) return { ok: false, error: "You can only edit your own replies." };

  revalidatePath(`/forum/${row.discussion_id}`);
  return { ok: true };
}

export async function deleteReplyAction(id: unknown): Promise<ForumResult> {
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return { ok: false, error: "Invalid reply." };
  const ctx = await authed();
  if (!ctx) return { ok: false, error: SIGN_IN };

  const { data, error } = await ctx.supabase
    .from("discussion_replies").delete().eq("id", parsed.data).eq("author_id", ctx.userId).select("id, discussion_id");
  if (error) return { ok: false, error: friendly(error) };
  const row = (data as { discussion_id: string }[] | null)?.[0];
  if (!row) return { ok: false, error: "This reply could not be deleted. It may already be gone, or it is not yours." };

  revalidatePath(`/forum/${row.discussion_id}`);
  revalidatePath("/forum");
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------------------------
// Likes and bookmarks (Phase 5.3). Set-style and idempotent: the browser says which state it wants. The user id
// comes only from the session; the database primary key makes a duplicate impossible, and RLS refuses anything
// that is not the caller's own row or not a visible item.
// ---------------------------------------------------------------------------------------------------------------
type Authed = NonNullable<Awaited<ReturnType<typeof authed>>>;

async function setLike(
  ctx: Authed,
  spec: { table: "discussion_likes" | "discussion_reply_likes"; itemColumn: "discussion_id" | "reply_id" },
  itemId: string,
  liked: boolean,
): Promise<{ error: DbError | null }> {
  if (liked) {
    const { error } = await ctx.supabase.from(spec.table).insert({ [spec.itemColumn]: itemId, user_id: ctx.userId });
    // Already liked (double click, second tab, retry): that is the state the user asked for.
    return { error: error && error.code !== UNIQUE_VIOLATION ? error : null };
  }
  const { error } = await ctx.supabase.from(spec.table).delete().eq(spec.itemColumn, itemId).eq("user_id", ctx.userId);
  return { error };
}

async function readLikeCount(ctx: Authed, table: "discussions" | "discussion_replies", id: string): Promise<number | null> {
  const { data } = await ctx.supabase.from(table).select("like_count").eq("id", id).maybeSingle();
  const n = (data as { like_count?: unknown } | null)?.like_count;
  return typeof n === "number" ? n : null;
}

function likeFailure(error: DbError): { ok: false; error: string } {
  if (error.code === "42501") return { ok: false, error: "You can't like this item." };
  if (error.code === "23503") return { ok: false, error: "This item no longer exists." };
  return { ok: false, error: friendly(error, "Your like could not be saved. Please try again.") };
}

export async function setDiscussionLikeAction(input: unknown): Promise<LikeResult> {
  const parsed = setDiscussionLikeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request. Please reload the page." };
  const ctx = await authed();
  if (!ctx) return { ok: false, error: SIGN_IN };
  const { discussionId, liked } = parsed.data;

  const { error } = await setLike(ctx, { table: "discussion_likes", itemColumn: "discussion_id" }, discussionId, liked);
  if (error) return likeFailure(error);
  const likeCount = await readLikeCount(ctx, "discussions", discussionId);
  revalidatePath(`/forum/${discussionId}`);
  revalidatePath("/forum");
  return { ok: true, liked, likeCount };
}

export async function setReplyLikeAction(input: unknown): Promise<LikeResult> {
  const parsed = setReplyLikeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request. Please reload the page." };
  const ctx = await authed();
  if (!ctx) return { ok: false, error: SIGN_IN };
  const { replyId, liked } = parsed.data;

  const { error } = await setLike(ctx, { table: "discussion_reply_likes", itemColumn: "reply_id" }, replyId, liked);
  if (error) return likeFailure(error);
  const likeCount = await readLikeCount(ctx, "discussion_replies", replyId);
  return { ok: true, liked, likeCount };
}

export async function setDiscussionBookmarkAction(input: unknown): Promise<ForumResult<{ bookmarked: boolean }>> {
  const parsed = setDiscussionBookmarkSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request. Please reload the page." };
  const ctx = await authed();
  if (!ctx) return { ok: false, error: SIGN_IN };
  const { discussionId, bookmarked } = parsed.data;

  if (bookmarked) {
    const { error } = await ctx.supabase.from("discussion_bookmarks").insert({ user_id: ctx.userId, discussion_id: discussionId });
    if (error && error.code !== UNIQUE_VIOLATION) {
      if (error.code === "42501") return { ok: false, error: "You can't bookmark this discussion." };
      if (error.code === "23503") return { ok: false, error: "This discussion no longer exists." };
      return { ok: false, error: friendly(error, "Your bookmark could not be saved. Please try again.") };
    }
  } else {
    const { error } = await ctx.supabase.from("discussion_bookmarks").delete().eq("discussion_id", discussionId).eq("user_id", ctx.userId);
    if (error) return { ok: false, error: friendly(error, "Your bookmark could not be removed. Please try again.") };
  }
  revalidatePath("/forum/bookmarks");
  return { ok: true, bookmarked };
}

// ---------------------------------------------------------------------------------------------------------------
// Reporting (Phase 5.4A). A report only RECORDS a concern: nothing is hidden, deleted or penalised, and there is no
// way for a user to read or change a status. The reporter comes from the session; the database enforces that the
// content is visible, not hidden and not the reporter's own, and that the same content is reported only once.
// ---------------------------------------------------------------------------------------------------------------
export async function reportContentAction(input: unknown): Promise<ForumResult<{ alreadyReported?: boolean }>> {
  const parsed = createReportSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error) };
  const ctx = await authed();
  if (!ctx) return { ok: false, error: SIGN_IN };

  const d = parsed.data;
  const { error } = await ctx.supabase.from("forum_reports").insert({
    reporter_id: ctx.userId, // from the session, never from the request
    content_type: d.contentType,
    content_id: d.contentId,
    reported_discussion_id: d.contentType === "discussion" ? d.contentId : null,
    reported_reply_id: d.contentType === "reply" ? d.contentId : null,
    reason: d.reason,
    description: d.description,
  });

  if (error?.code === UNIQUE_VIOLATION) {
    // Same user, same content: the database holds exactly one report, so this is reported as such rather than stored again.
    return { ok: true, alreadyReported: true };
  }
  if (error) {
    if (isMissingSchema(error)) return { ok: false, error: "Reporting is not available yet. Please try again later." };
    if (error.code === "42501") return { ok: false, error: "You can't report this. You cannot report your own posts, or posts that are no longer available." };
    if (error.code === "23503") return { ok: false, error: "This post no longer exists." };
    if (error.code === "23514") return { ok: false, error: "Please check the reason and details and try again." };
    return { ok: false, error: "Your report could not be sent. Please try again." };
  }
  return { ok: true };
}
