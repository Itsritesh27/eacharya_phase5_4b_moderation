import type { SupabaseClient } from "@supabase/supabase-js";
import { isMissingSchema } from "./data";
import { MODERATION_PAGE_SIZE, REPORT_STATUSES, type ReportFilters, type ReportStatus } from "./moderation";
import { excerpt } from "./format";
import type { ReportContentType } from "./report-reasons";
import type { Loaded } from "./types";

export interface ReportedContent {
  /** "deleted" = the post no longer exists (the report keeps only its type and id). */
  state: "available" | "hidden" | "deleted";
  title?: string;
  excerpt?: string;
  /** Where a moderator can read it, when it still exists. */
  href?: string;
}

export interface ModerationEvent {
  id: string; moderatorName: string | null; fromStatus: string; toStatus: string;
  contentAction: "hidden" | "restored" | null; note: string | null; createdAt: string;
}

export interface ReportRow {
  id: string;
  contentType: ReportContentType;
  reason: string;
  description: string | null;
  status: ReportStatus;
  createdAt: string;
  /** Display name only. No email, no id is exposed to the page. */
  reporterName: string;
  content: ReportedContent;
  /** Newest first. */
  events: ModerationEvent[];
}

interface DbError { code?: string; message?: string }
const failure = <T>(e: DbError): Loaded<T> => (isMissingSchema(e) ? { status: "unavailable" } : { status: "error" });
const isPastEnd = (e: DbError | null | undefined) => e?.code === "PGRST103";

interface ReportDbRow {
  id: string; reporter_id: string; content_type: ReportContentType; reason: string; description: string | null;
  status: ReportStatus; created_at: string; reported_discussion_id: string | null; reported_reply_id: string | null;
  discussions: { id: string; title: string; is_hidden: boolean } | null;
  discussion_replies: { id: string; body: string; is_hidden: boolean; discussion_id: string } | null;
}

export function contentFrom(r: ReportDbRow): ReportedContent {
  if (r.content_type === "discussion") {
    const d = r.discussions;
    if (!d) return { state: "deleted" };
    return { state: d.is_hidden ? "hidden" : "available", title: d.title, href: `/forum/${d.id}` };
  }
  const p = r.discussion_replies;
  if (!p) return { state: "deleted" };
  return { state: p.is_hidden ? "hidden" : "available", excerpt: excerpt(p.body, 200), href: `/forum/${p.discussion_id}#reply-${p.id}` };
}

export async function getStatusCounts(supabase: SupabaseClient): Promise<Loaded<Record<ReportStatus, number>>> {
  const results = await Promise.all(
    REPORT_STATUSES.map((s) => supabase.from("forum_reports").select("id", { count: "exact", head: true }).eq("status", s.value)),
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) return failure(failed.error);
  const out = {} as Record<ReportStatus, number>;
  REPORT_STATUSES.forEach((s, i) => { out[s.value] = results[i]!.count ?? 0; });
  return { status: "ok", data: out };
}

/**
 * The moderation queue. Row-level security lets only moderators read reports at all, so for anyone else this returns
 * nothing even if called directly. Filters and sort run in the database; one page is read at a time.
 */
export async function listReports(
  supabase: SupabaseClient,
  f: ReportFilters,
): Promise<Loaded<{ items: ReportRow[]; total: number; page: number; pageSize: number }>> {
  const from = (f.page - 1) * MODERATION_PAGE_SIZE;
  let q = supabase
    .from("forum_reports")
    .select(
      "id, reporter_id, content_type, reason, description, status, created_at, reported_discussion_id, reported_reply_id, " +
        "discussions(id, title, is_hidden), discussion_replies(id, body, is_hidden, discussion_id)",
      { count: "exact" },
    );
  if (f.status) q = q.eq("status", f.status);
  if (f.type) q = q.eq("content_type", f.type);
  if (f.reason) q = q.eq("reason", f.reason);
  const asc = f.sort === "oldest";
  q = q.order("created_at", { ascending: asc }).order("id", { ascending: asc }).range(from, from + MODERATION_PAGE_SIZE - 1);

  const { data, error, count } = await q;
  if (isPastEnd(error)) return { status: "ok", data: { items: [], total: 0, page: f.page, pageSize: MODERATION_PAGE_SIZE } };
  if (error) return failure(error);

  const rows = (data ?? []) as unknown as ReportDbRow[];
  const names = await getDisplayNames(supabase, [
    ...rows.map((r) => r.reporter_id),
  ]);
  const events = await getEvents(supabase, rows.map((r) => r.id), names);

  const items: ReportRow[] = rows.map((r) => ({
    id: r.id, contentType: r.content_type, reason: r.reason, description: r.description, status: r.status,
    createdAt: r.created_at, reporterName: names.get(r.reporter_id) ?? "Former member",
    content: contentFrom(r), events: events.get(r.id) ?? [],
  }));
  return { status: "ok", data: { items, total: count ?? items.length, page: f.page, pageSize: MODERATION_PAGE_SIZE } };
}

/** Display names only (never email). Moderators may read profiles through the existing admin policy. */
async function getDisplayNames(supabase: SupabaseClient, ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (unique.length === 0) return out;
  const { data } = await supabase.from("profiles").select("id, full_name").in("id", unique);
  for (const p of (data ?? []) as { id: string; full_name: string | null }[]) out.set(p.id, p.full_name?.trim() || "eAcharya member");
  return out;
}

async function getEvents(supabase: SupabaseClient, reportIds: string[], known: Map<string, string>): Promise<Map<string, ModerationEvent[]>> {
  const out = new Map<string, ModerationEvent[]>();
  if (reportIds.length === 0) return out;
  const { data } = await supabase
    .from("forum_report_events")
    .select("id, report_id, moderator_id, from_status, to_status, content_action, note, created_at")
    .in("report_id", reportIds)
    .order("created_at", { ascending: false });
  const rows = (data ?? []) as {
    id: string; report_id: string; moderator_id: string | null; from_status: string; to_status: string;
    content_action: string | null; note: string | null; created_at: string;
  }[];
  const names = await getDisplayNames(supabase, rows.map((e) => e.moderator_id ?? "").filter((id) => id && !known.has(id)));
  for (const e of rows) {
    const list = out.get(e.report_id) ?? [];
    list.push({
      id: e.id,
      moderatorName: e.moderator_id ? (names.get(e.moderator_id) ?? known.get(e.moderator_id) ?? "A moderator") : null,
      fromStatus: e.from_status, toStatus: e.to_status,
      contentAction: e.content_action === "hidden" || e.content_action === "restored" ? e.content_action : null,
      note: e.note, createdAt: e.created_at,
    });
    out.set(e.report_id, list);
  }
  return out;
}
