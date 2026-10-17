import type { SupabaseClient } from "@supabase/supabase-js";
import { isRole } from "@/lib/auth/roles";
import type { ForumCategorySlug, ForumGrade, ForumSort } from "./categories";
import { excerpt, toSearchPattern } from "./format";
import type { AuthorCard, BookmarkedDiscussion, DiscussionDetail, DiscussionSummary, Loaded, ReplyItem } from "./types";

export const PAGE_SIZE = 15;
export const REPLY_LIMIT = 200;

interface DbError { code?: string; message?: string }

/** Table or function missing: the Phase 5.2 migration has not been applied to this database. */
export function isMissingSchema(error: DbError | null | undefined): boolean {
  if (!error) return false;
  return (
    error.code === "42P01" || error.code === "42703" || error.code === "42883" || error.code === "PGRST205" || error.code === "PGRST202" ||
    /does not exist|could not find the (table|function)/i.test(error.message ?? "")
  );
}

function failure<T>(error: DbError): Loaded<T> {
  return isMissingSchema(error) ? { status: "unavailable" } : { status: "error" };
}

interface SummaryRow {
  id: string; title: string; body: string; grade: number; category: string; author_id: string;
  created_at: string; like_count: number; discussion_replies: { count: number }[] | null;
}

export interface ListFilters { q: string; grade?: ForumGrade; category?: ForumCategorySlug; sort: ForumSort; page: number }

/** PostgREST answers 416 / PGRST103 when the requested page is past the last row. That is an empty page, not a failure. */
const isPastEnd = (e: DbError | null | undefined) => e?.code === "PGRST103";

export async function listDiscussions(
  supabase: SupabaseClient,
  f: ListFilters,
): Promise<Loaded<{ items: DiscussionSummary[]; total: number; page: number; pageSize: number }>> {
  const from = (f.page - 1) * PAGE_SIZE;
  let query = supabase
    .from("discussions")
    .select("id, title, body, grade, category, author_id, created_at, like_count, discussion_replies(count)", { count: "exact" })
    .eq("is_hidden", false); // also lets the planner use the partial search and sort indexes

  // Stable total order (ties broken by newest, then id) so pages never repeat or skip rows.
  if (f.sort === "liked") query = query.order("like_count", { ascending: false });
  query = query.order("created_at", { ascending: false }).order("id", { ascending: false }).range(from, from + PAGE_SIZE - 1);

  if (f.grade) query = query.eq("grade", f.grade);
  if (f.category) query = query.eq("category", f.category);
  const pattern = toSearchPattern(f.q);
  if (pattern) query = query.or(`title.ilike."%${pattern}%",body.ilike."%${pattern}%"`);

  const { data, error, count } = await query;
  if (isPastEnd(error)) return { status: "ok", data: { items: [], total: 0, page: f.page, pageSize: PAGE_SIZE } };
  if (error) return failure(error);

  const rows = (data ?? []) as unknown as SummaryRow[];
  const mine = await getMyDiscussionStates(supabase, rows.map((r) => r.id));
  const items: DiscussionSummary[] = rows.map((r) => ({
    id: r.id,
    title: r.title,
    excerpt: excerpt(r.body),
    grade: r.grade,
    category: r.category,
    authorId: r.author_id,
    createdAt: r.created_at,
    replyCount: r.discussion_replies?.[0]?.count ?? 0,
    likeCount: r.like_count ?? 0,
    likedByMe: mine.liked.has(r.id),
    bookmarkedByMe: mine.bookmarked.has(r.id),
  }));
  return { status: "ok", data: { items, total: count ?? items.length, page: f.page, pageSize: PAGE_SIZE } };
}

interface DetailRow {
  id: string; title: string; body: string; grade: number; category: string; links: string[] | null;
  author_id: string; is_hidden: boolean; created_at: string; updated_at: string; like_count: number;
}

/** Returns `data: null` when no such discussion exists or RLS hides it from this user. */
export async function getDiscussion(supabase: SupabaseClient, id: string): Promise<Loaded<DiscussionDetail | null>> {
  const { data, error } = await supabase
    .from("discussions")
    .select("id, title, body, grade, category, links, author_id, is_hidden, created_at, updated_at, like_count")
    .eq("id", id)
    .maybeSingle();
  if (error) return failure(error);
  if (!data) return { status: "ok", data: null };
  const r = data as unknown as DetailRow;
  return {
    status: "ok",
    data: {
      id: r.id, title: r.title, body: r.body, grade: r.grade, category: r.category, links: r.links ?? [],
      authorId: r.author_id, isHidden: r.is_hidden, createdAt: r.created_at, updatedAt: r.updated_at, likeCount: r.like_count ?? 0,
    },
  };
}

interface ReplyRow {
  id: string; discussion_id: string; author_id: string; body: string; created_at: string; updated_at: string; like_count: number;
}

export async function listReplies(
  supabase: SupabaseClient,
  discussionId: string,
): Promise<Loaded<{ items: ReplyItem[]; total: number }>> {
  const { data, error, count } = await supabase
    .from("discussion_replies")
    .select("id, discussion_id, author_id, body, created_at, updated_at, like_count", { count: "exact" })
    .eq("discussion_id", discussionId)
    .eq("is_hidden", false)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(REPLY_LIMIT);
  if (error) return failure(error);
  const items = ((data ?? []) as unknown as ReplyRow[]).map((r) => ({
    id: r.id, discussionId: r.discussion_id, authorId: r.author_id, body: r.body,
    createdAt: r.created_at, updatedAt: r.updated_at, likeCount: r.like_count ?? 0,
  }));
  return { status: "ok", data: { items, total: count ?? items.length } };
}

/**
 * Display names and verified roles. Profiles are private, so this goes through the narrow
 * forum_author_cards() database function (name and role only, only for people with visible posts).
 * If it fails the page still renders, with a neutral name and no badge.
 */
export async function getAuthorCards(supabase: SupabaseClient, ids: string[]): Promise<Map<string, AuthorCard>> {
  const unique = Array.from(new Set(ids)).slice(0, 200);
  const out = new Map<string, AuthorCard>();
  if (unique.length === 0) return out;
  const { data, error } = await supabase.rpc("forum_author_cards", { p_ids: unique });
  if (error || !Array.isArray(data)) return out;
  for (const row of data as { id: string; display_name: string; role: unknown }[]) {
    if (isRole(row.role)) out.set(row.id, { id: row.id, name: row.display_name, role: row.role });
  }
  return out;
}

/**
 * Which of these discussions the signed-in user has liked or bookmarked. Row-level security only ever returns
 * the caller's own rows, so no user id is sent or trusted here. A failure just means "not marked": clicking
 * is idempotent on the server, so a wrong starting state cannot create duplicates.
 */
export async function getMyDiscussionStates(
  supabase: SupabaseClient,
  ids: string[],
): Promise<{ liked: Set<string>; bookmarked: Set<string> }> {
  const out = { liked: new Set<string>(), bookmarked: new Set<string>() };
  if (ids.length === 0) return out;
  const [likes, marks] = await Promise.all([
    supabase.from("discussion_likes").select("discussion_id").in("discussion_id", ids),
    supabase.from("discussion_bookmarks").select("discussion_id").in("discussion_id", ids),
  ]);
  for (const r of (likes.data ?? []) as { discussion_id: string }[]) out.liked.add(r.discussion_id);
  for (const r of (marks.data ?? []) as { discussion_id: string }[]) out.bookmarked.add(r.discussion_id);
  return out;
}

export async function getMyReplyLikes(supabase: SupabaseClient, replyIds: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  if (replyIds.length === 0) return out;
  const { data } = await supabase.from("discussion_reply_likes").select("reply_id").in("reply_id", replyIds);
  for (const r of (data ?? []) as { reply_id: string }[]) out.add(r.reply_id);
  return out;
}

interface BookmarkRow {
  created_at: string;
  discussions: { id: string; title: string; grade: number; category: string } | null;
}

/**
 * The signed-in user's own bookmarks, newest first. `discussions!inner` drops bookmarks whose discussion is gone or
 * hidden from this user (RLS), so counts and pages stay consistent.
 */
export async function listBookmarks(
  supabase: SupabaseClient,
  page: number,
): Promise<Loaded<{ items: BookmarkedDiscussion[]; total: number; page: number; pageSize: number }>> {
  const from = (page - 1) * PAGE_SIZE;
  const { data, error, count } = await supabase
    .from("discussion_bookmarks")
    .select("created_at, discussions!inner(id, title, grade, category)", { count: "exact" })
    .order("created_at", { ascending: false })
    .order("discussion_id", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);
  if (isPastEnd(error)) return { status: "ok", data: { items: [], total: 0, page, pageSize: PAGE_SIZE } };
  if (error) return failure(error);
  const items = ((data ?? []) as unknown as BookmarkRow[])
    .filter((r) => r.discussions)
    .map((r) => ({
      id: r.discussions!.id, title: r.discussions!.title, grade: r.discussions!.grade,
      category: r.discussions!.category, bookmarkedAt: r.created_at,
    }));
  return { status: "ok", data: { items, total: count ?? items.length, page, pageSize: PAGE_SIZE } };
}

/** Which of these discussions or replies the signed-in user has already reported (own rows only, by RLS). */
export async function getMyReportedIds(
  supabase: SupabaseClient,
  contentType: "discussion" | "reply",
  ids: string[],
): Promise<Set<string>> {
  const out = new Set<string>();
  if (ids.length === 0) return out;
  const { data } = await supabase.from("forum_reports").select("content_id").eq("content_type", contentType).in("content_id", ids);
  for (const r of (data ?? []) as { content_id: string }[]) out.add(r.content_id);
  return out;
}
