import { beforeEach, describe, expect, it, vi } from "vitest";

// ---- A tiny fake of the Supabase query builder. Each from() call consumes the next queued result. ----
interface Call { table: string; ops: { op: string; args: unknown[] }[] }
const state: { user: { id: string } | null; queue: { data?: unknown; error?: { code?: string; message?: string } | null }[]; calls: Call[] } = {
  user: { id: "session-user" }, queue: [], calls: [],
};

function builder(call: Call, result: { data?: unknown; error?: unknown }) {
  const b: Record<string, unknown> = {};
  for (const op of ["insert", "update", "delete", "select", "eq", "single", "maybeSingle"]) {
    b[op] = (...args: unknown[]) => { call.ops.push({ op, args }); return b; };
  }
  b.then = (resolve: (v: unknown) => unknown) => resolve({ data: result.data ?? null, error: result.error ?? null });
  return b;
}

vi.mock("@/lib/supabase/env", () => ({ isSupabaseConfigured: () => true }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from: (table: string) => {
      const call: Call = { table, ops: [] };
      state.calls.push(call);
      return builder(call, state.queue.shift() ?? {});
    },
  }),
}));

import { revalidatePath } from "next/cache";
import {
  createDiscussionAction, createReplyAction, deleteDiscussionAction, deleteReplyAction, updateDiscussionAction, updateReplyAction,
  reportContentAction, setDiscussionBookmarkAction, setDiscussionLikeAction, setReplyLikeAction,
} from "./actions";

const TOKEN = "11111111-1111-4111-8111-111111111111";
const DID = "22222222-2222-4222-8222-222222222222";
const RID = "33333333-3333-4333-8333-333333333333";
const goodDiscussion = { title: "Why does the monsoon burst?", body: "Please explain the onset of the monsoon.", grade: 10, category: "climate", links: [], clientToken: TOKEN };

const payload = (i = 0) => state.calls[i]!.ops.find((o) => o.op === "insert" || o.op === "update")?.args[0] as Record<string, unknown>;
const eqs = (i = 0) => state.calls[i]!.ops.filter((o) => o.op === "eq").map((o) => `${o.args[0]}=${o.args[1]}`);

beforeEach(() => {
  state.user = { id: "session-user" }; state.queue = []; state.calls = [];
  vi.mocked(revalidatePath).mockClear();
});

describe("createDiscussionAction", () => {
  it("saves a valid discussion and returns the id the database confirmed", async () => {
    state.queue = [{ data: { id: DID } }];
    const res = await createDiscussionAction(goodDiscussion);
    expect(res).toEqual({ ok: true, id: DID });
    expect(state.calls[0]!.table).toBe("discussions");
    expect(revalidatePath).toHaveBeenCalledWith("/forum");
  });

  it("takes the author from the session and ignores any author sent by the browser", async () => {
    state.queue = [{ data: { id: DID } }];
    await createDiscussionAction({ ...goodDiscussion, authorId: "attacker", author_id: "attacker", is_hidden: true });
    const p = payload();
    expect(p.author_id).toBe("session-user");
    expect(Object.keys(p).sort()).toEqual(["author_id", "body", "category", "client_token", "grade", "links", "title"]);
  });

  it("rejects invalid input without touching the database", async () => {
    const res = await createDiscussionAction({ ...goodDiscussion, title: "no", body: "" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(Object.keys(res.fieldErrors ?? {}).sort()).toEqual(["body", "title"]);
    expect(state.calls).toHaveLength(0);
  });

  it("refuses signed-out callers without touching the database", async () => {
    state.user = null;
    const res = await createDiscussionAction(goodDiscussion);
    expect(res).toEqual({ ok: false, error: "Please sign in again to continue." });
    expect(state.calls).toHaveLength(0);
  });

  it("never reports success when the database fails, and never leaks raw database text", async () => {
    state.queue = [{ error: { code: "XX000", message: "connection to server at 10.0.0.5 lost" } }];
    const res = await createDiscussionAction(goodDiscussion);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).not.toMatch(/10\.0\.0\.5|connection/);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("a repeated submission with the same token returns the original post, not a second one", async () => {
    state.queue = [{ error: { code: "23505", message: "duplicate key" } }, { data: { id: "existing-id" } }];
    const res = await createDiscussionAction(goodDiscussion);
    expect(res).toEqual({ ok: true, id: "existing-id" });
    expect(eqs(1)).toEqual(["author_id=session-user", `client_token=${TOKEN}`]);
  });

  it("explains a missing forum schema in plain words", async () => {
    state.queue = [{ error: { code: "42P01", message: 'relation "public.discussions" does not exist' } }];
    const res = await createDiscussionAction(goodDiscussion);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/not available yet/);
  });

  it("maps a row-level-security rejection to a permission message", async () => {
    state.queue = [{ error: { code: "42501", message: "new row violates row-level security policy" } }];
    const res = await createDiscussionAction(goodDiscussion);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/permission/);
  });
});

describe("createReplyAction", () => {
  const good = { discussionId: DID, body: "Winds reverse because land heats faster.", clientToken: TOKEN };

  it("saves a reply for the right discussion, as the session user", async () => {
    state.queue = [{ data: { id: RID } }];
    const res = await createReplyAction({ ...good, authorId: "attacker" });
    expect(res).toEqual({ ok: true, id: RID });
    expect(payload()).toMatchObject({ author_id: "session-user", discussion_id: DID });
    expect(payload()).not.toHaveProperty("authorId");
    expect(revalidatePath).toHaveBeenCalledWith(`/forum/${DID}`);
  });

  it("rejects blank and over-long replies", async () => {
    for (const body of ["", "   ", "x".repeat(5001)]) {
      const res = await createReplyAction({ ...good, body });
      expect(res.ok).toBe(false);
    }
    expect(state.calls).toHaveLength(0);
  });

  it("does not show a reply as posted when the database rejects it", async () => {
    state.queue = [{ error: { code: "42501", message: "rls" } }];
    const res = await createReplyAction(good);
    expect(res).toEqual({ ok: false, error: "You can't reply to this discussion." });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("handles a double click safely", async () => {
    state.queue = [{ error: { code: "23505" } }, { data: { id: RID } }];
    expect(await createReplyAction(good)).toEqual({ ok: true, id: RID });
  });

  it("reports a deleted parent discussion", async () => {
    state.queue = [{ error: { code: "23503", message: "fk" } }];
    const res = await createReplyAction(good);
    expect(res.ok).toBe(false);
  });
});

describe("author-only edits and deletes", () => {
  it("edits a discussion only when the row belongs to the session user", async () => {
    state.queue = [{ data: [{ id: DID }] }];
    const res = await updateDiscussionAction({ id: DID, title: "A new title", body: "A new long body.", links: [] });
    expect(res).toEqual({ ok: true });
    expect(eqs()).toEqual([`id=${DID}`, "author_id=session-user"]);
    expect(Object.keys(payload()).sort()).toEqual(["body", "links", "title"]);
  });

  it("reports failure when nothing was updated (someone else's discussion)", async () => {
    state.queue = [{ data: [] }];
    const res = await updateDiscussionAction({ id: DID, title: "A new title", body: "A new long body.", links: [] });
    expect(res).toEqual({ ok: false, error: "You can only edit your own discussions." });
  });

  it("does not change authorship or class even if the browser sends them", async () => {
    state.queue = [{ data: [{ id: DID }] }];
    await updateDiscussionAction({ id: DID, title: "A new title", body: "A new long body.", links: [], author_id: "x", grade: 12 });
    expect(Object.keys(payload()).sort()).toEqual(["body", "links", "title"]);
  });

  it("deletes a discussion only for its author", async () => {
    state.queue = [{ data: [{ id: DID }] }];
    expect(await deleteDiscussionAction(DID)).toEqual({ ok: true });
    expect(eqs()).toEqual([`id=${DID}`, "author_id=session-user"]);
  });

  it("shows the database's plain reason when a discussion already has replies", async () => {
    state.queue = [{ error: { code: "23514", message: "This discussion has replies, so it can no longer be deleted." } }];
    const res = await deleteDiscussionAction(DID);
    expect(res).toEqual({ ok: false, error: "This discussion has replies, so it can no longer be deleted." });
  });

  it("reports failure when a delete matched no row", async () => {
    state.queue = [{ data: [] }];
    const res = await deleteDiscussionAction(DID);
    expect(res.ok).toBe(false);
  });

  it("edits and deletes replies only for their author", async () => {
    state.queue = [{ data: [{ id: RID, discussion_id: DID }] }];
    expect(await updateReplyAction({ id: RID, body: "Edited reply" })).toEqual({ ok: true });
    expect(eqs()).toEqual([`id=${RID}`, "author_id=session-user"]);
    expect(revalidatePath).toHaveBeenCalledWith(`/forum/${DID}`);

    state.calls = []; state.queue = [{ data: [] }];
    expect((await updateReplyAction({ id: RID, body: "Edited reply" })).ok).toBe(false);

    state.calls = []; state.queue = [{ data: [{ id: RID, discussion_id: DID }] }];
    expect(await deleteReplyAction(RID)).toEqual({ ok: true });
    expect(eqs()).toEqual([`id=${RID}`, "author_id=session-user"]);

    state.queue = [{ data: [] }];
    expect((await deleteReplyAction(RID)).ok).toBe(false);
  });

  it("refuses everything when signed out, and rejects malformed ids", async () => {
    state.user = null;
    for (const res of [
      await updateDiscussionAction({ id: DID, title: "A new title", body: "A new long body.", links: [] }),
      await deleteDiscussionAction(DID), await updateReplyAction({ id: RID, body: "x" }), await deleteReplyAction(RID),
    ]) expect(res.ok).toBe(false);
    state.user = { id: "session-user" };
    expect((await deleteDiscussionAction("not-a-uuid")).ok).toBe(false);
    expect((await deleteReplyAction("../etc")).ok).toBe(false);
    expect(state.calls).toHaveLength(0);
  });
});

describe("likes", () => {
  it("likes as the session user, ignoring any user id from the browser, and returns the database's count", async () => {
    state.queue = [{}, { data: { like_count: 4 } }];
    const res = await setDiscussionLikeAction({ discussionId: DID, liked: true, userId: "attacker", user_id: "attacker" });
    expect(res).toEqual({ ok: true, liked: true, likeCount: 4 });
    expect(state.calls[0]!.table).toBe("discussion_likes");
    expect(payload()).toEqual({ discussion_id: DID, user_id: "session-user" });
    expect(state.calls[1]!.table).toBe("discussions");
  });

  it("treats an already-existing like as success, so repeated likes cannot inflate or fail", async () => {
    state.queue = [{ error: { code: "23505", message: "duplicate key" } }, { data: { like_count: 1 } }];
    expect(await setDiscussionLikeAction({ discussionId: DID, liked: true })).toEqual({ ok: true, liked: true, likeCount: 1 });
  });

  it("unlikes by deleting only the caller's own row", async () => {
    state.queue = [{}, { data: { like_count: 0 } }];
    const res = await setDiscussionLikeAction({ discussionId: DID, liked: false });
    expect(res).toEqual({ ok: true, liked: false, likeCount: 0 });
    expect(state.calls[0]!.ops.some((o) => o.op === "delete")).toBe(true);
    expect(eqs()).toEqual([`discussion_id=${DID}`, "user_id=session-user"]);
  });

  it("likes replies through the reply table", async () => {
    state.queue = [{}, { data: { like_count: 2 } }];
    const res = await setReplyLikeAction({ replyId: RID, liked: true });
    expect(res).toEqual({ ok: true, liked: true, likeCount: 2 });
    expect(state.calls[0]!.table).toBe("discussion_reply_likes");
    expect(payload()).toEqual({ reply_id: RID, user_id: "session-user" });
  });

  it("rejects bad input and signed-out callers without touching the database", async () => {
    expect((await setDiscussionLikeAction({ discussionId: "nope", liked: true })).ok).toBe(false);
    expect((await setDiscussionLikeAction({ discussionId: DID, liked: "yes" })).ok).toBe(false);
    state.user = null;
    expect(await setDiscussionLikeAction({ discussionId: DID, liked: true })).toEqual({ ok: false, error: "Please sign in again to continue." });
    expect(state.calls).toHaveLength(0);
  });

  it("reports (never fakes) database refusals and failures", async () => {
    state.queue = [{ error: { code: "42501", message: "rls" } }];
    expect(await setDiscussionLikeAction({ discussionId: DID, liked: true })).toEqual({ ok: false, error: "You can't like this item." });
    state.queue = [{ error: { code: "23503", message: "fk" } }];
    expect((await setReplyLikeAction({ replyId: RID, liked: true })).ok).toBe(false);
    state.queue = [{ error: { code: "XX000", message: "host 10.0.0.9 down" } }];
    const res = await setDiscussionLikeAction({ discussionId: DID, liked: true });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).not.toMatch(/10\.0\.0\.9/);
  });
});

describe("discussion bookmarks", () => {
  it("adds a bookmark for the session user only", async () => {
    state.queue = [{}];
    expect(await setDiscussionBookmarkAction({ discussionId: DID, bookmarked: true, userId: "attacker" })).toEqual({ ok: true, bookmarked: true });
    expect(state.calls[0]!.table).toBe("discussion_bookmarks");
    expect(payload()).toEqual({ user_id: "session-user", discussion_id: DID });
  });

  it("a duplicate bookmark is a harmless success", async () => {
    state.queue = [{ error: { code: "23505" } }];
    expect(await setDiscussionBookmarkAction({ discussionId: DID, bookmarked: true })).toEqual({ ok: true, bookmarked: true });
  });

  it("removes only the caller's bookmark", async () => {
    state.queue = [{}];
    expect(await setDiscussionBookmarkAction({ discussionId: DID, bookmarked: false })).toEqual({ ok: true, bookmarked: false });
    expect(eqs()).toEqual([`discussion_id=${DID}`, "user_id=session-user"]);
    expect(revalidatePath).toHaveBeenCalledWith("/forum/bookmarks");
  });

  it("rejects signed-out callers, invalid ids and database refusals", async () => {
    expect((await setDiscussionBookmarkAction({ discussionId: "x", bookmarked: true })).ok).toBe(false);
    state.queue = [{ error: { code: "42501" } }];
    expect((await setDiscussionBookmarkAction({ discussionId: DID, bookmarked: true })).ok).toBe(false);
    state.user = null;
    expect((await setDiscussionBookmarkAction({ discussionId: DID, bookmarked: true })).ok).toBe(false);
  });
});

describe("reportContentAction", () => {
  const goodReport = { contentType: "discussion", contentId: DID, reason: "spam", description: "An advert" };

  it("files a discussion report as the session user and never sets a status", async () => {
    state.queue = [{}];
    const res = await reportContentAction({ ...goodReport, reporterId: "attacker", reporter_id: "attacker", status: "action_taken" });
    expect(res).toEqual({ ok: true });
    expect(state.calls[0]!.table).toBe("forum_reports");
    expect(payload()).toEqual({
      reporter_id: "session-user", content_type: "discussion", content_id: DID,
      reported_discussion_id: DID, reported_reply_id: null, reason: "spam", description: "An advert",
    });
    expect(payload()).not.toHaveProperty("status");
  });

  it("files a reply report against the reply reference", async () => {
    state.queue = [{}];
    const res = await reportContentAction({ contentType: "reply", contentId: RID, reason: "abusive" });
    expect(res).toEqual({ ok: true });
    expect(payload()).toMatchObject({ content_type: "reply", reported_reply_id: RID, reported_discussion_id: null, description: null });
  });

  it("rejects invalid reasons and a missing explanation for 'other' without touching the database", async () => {
    expect((await reportContentAction({ ...goodReport, reason: "bogus" })).ok).toBe(false);
    const other = await reportContentAction({ ...goodReport, reason: "other", description: "" });
    expect(other.ok).toBe(false);
    if (!other.ok) expect(Object.keys(other.fieldErrors ?? {})).toEqual(["description"]);
    expect((await reportContentAction({ ...goodReport, contentId: "x" })).ok).toBe(false);
    expect(state.calls).toHaveLength(0);
  });

  it("refuses signed-out callers without touching the database", async () => {
    state.user = null;
    expect(await reportContentAction(goodReport)).toEqual({ ok: false, error: "Please sign in again to continue." });
    expect(state.calls).toHaveLength(0);
  });

  it("reports a repeat as already reported, not as a second report", async () => {
    state.queue = [{ error: { code: "23505", message: "duplicate key" } }];
    expect(await reportContentAction(goodReport)).toEqual({ ok: true, alreadyReported: true });
    expect(state.calls).toHaveLength(1);
  });

  it("maps database refusals (own post, hidden post, deleted post) to plain messages and never reports success", async () => {
    state.queue = [{ error: { code: "42501", message: "new row violates row-level security policy" } }];
    const denied = await reportContentAction(goodReport);
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.error).toMatch(/can't report this/);

    state.queue = [{ error: { code: "23503", message: "fk" } }];
    const gone = await reportContentAction(goodReport);
    expect(gone).toEqual({ ok: false, error: "This post no longer exists." });

    state.queue = [{ error: { code: "42P01", message: 'relation "public.forum_reports" does not exist' } }];
    const missing = await reportContentAction(goodReport);
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error).toMatch(/not available yet/);

    state.queue = [{ error: { code: "XX000", message: "host 10.0.0.9 down" } }];
    const other = await reportContentAction(goodReport);
    expect(other.ok).toBe(false);
    if (!other.ok) expect(other.error).not.toMatch(/10\.0\.0\.9/);
  });

  it("does not revalidate or change any other forum data", async () => {
    state.queue = [{}];
    await reportContentAction(goodReport);
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(state.calls.map((c) => c.table)).toEqual(["forum_reports"]);
  });
});
