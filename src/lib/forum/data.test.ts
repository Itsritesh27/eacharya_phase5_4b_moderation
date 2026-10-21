import { describe, expect, it } from "vitest";
import { PAGE_SIZE, getMyDiscussionStates, getMyReportedIds, listBookmarks, listDiscussions } from "./data";

interface Op { op: string; args: unknown[] }
type Result = { data?: unknown; error?: { code?: string; message?: string } | null; count?: number | null };

/** Fake client: records every call per table and returns the queued result for each from(). */
function fake(queue: Result[]) {
  const calls: { table: string; ops: Op[] }[] = [];
  const client = {
    from(table: string) {
      const call = { table, ops: [] as Op[] };
      calls.push(call);
      const result = queue.shift() ?? {};
      const b: Record<string, unknown> = {};
      for (const op of ["select", "eq", "or", "order", "range", "in"]) b[op] = (...args: unknown[]) => { call.ops.push({ op, args }); return b; };
      b.then = (resolve: (v: unknown) => unknown) => resolve({ data: result.data ?? null, error: result.error ?? null, count: result.count ?? null });
      return b;
    },
  };
  return { client: client as never, calls };
}
const has = (ops: Op[], op: string, ...args: unknown[]) =>
  ops.some((o) => o.op === op && args.every((a, i) => JSON.stringify(o.args[i]) === JSON.stringify(a)));

const row = (id: string, likes = 0) => ({
  id, title: `T ${id}`, body: "body text here", grade: 10, category: "climate", author_id: "a", created_at: "2026-10-01T00:00:00Z",
  like_count: likes, discussion_replies: [{ count: 2 }],
});

describe("listDiscussions", () => {
  it("orders newest first by default, with a stable id tiebreak and real pagination bounds", async () => {
    const { client, calls } = fake([{ data: [row("d1")], count: 40 }, { data: [] }, { data: [] }]);
    const res = await listDiscussions(client, { q: "", sort: "newest", page: 3 });
    const ops = calls[0]!.ops;
    expect(has(ops, "order", "created_at", { ascending: false })).toBe(true);
    expect(has(ops, "order", "like_count")).toBe(false);
    expect(has(ops, "range", 2 * PAGE_SIZE, 3 * PAGE_SIZE - 1)).toBe(true);
    expect(has(ops, "eq", "is_hidden", false)).toBe(true);
    expect(res.status === "ok" && res.data.total).toBe(40);
  });

  it("sorts most liked by the stored count first, then newest", async () => {
    const { client, calls } = fake([{ data: [row("d1", 5), row("d2", 3)], count: 2 }, { data: [] }, { data: [] }]);
    const res = await listDiscussions(client, { q: "", sort: "liked", page: 1 });
    const orders = calls[0]!.ops.filter((o) => o.op === "order").map((o) => o.args[0]);
    expect(orders).toEqual(["like_count", "created_at", "id"]);
    expect(res.status === "ok" && res.data.items.map((i) => i.likeCount)).toEqual([5, 3]);
  });

  it("combines search, class and topic in one database query", async () => {
    const { client, calls } = fake([{ data: [], count: 0 }]);
    await listDiscussions(client, { q: "mon,soon", grade: 11, category: "climate", sort: "newest", page: 1 });
    const ops = calls[0]!.ops;
    expect(has(ops, "eq", "grade", 11)).toBe(true);
    expect(has(ops, "eq", "category", "climate")).toBe(true);
    const or = ops.find((o) => o.op === "or")!.args[0] as string;
    expect(or).toBe('title.ilike."%mon soon%",body.ilike."%mon soon%"');
  });

  it("neutralises wildcard and filter-breaking characters in the search text", async () => {
    const { client, calls } = fake([{ data: [], count: 0 }]);
    await listDiscussions(client, { q: '100%_),or(id.neq."x', sort: "newest", page: 1 });
    const or = calls[0]!.ops.find((o) => o.op === "or")!.args[0] as string;
    expect(or).not.toContain("or(");
    expect(or.slice(or.indexOf('"%') + 2, or.indexOf('%"'))).not.toMatch(/[%_,()"]/);
  });

  it("does not add a search filter for an empty query", async () => {
    const { client, calls } = fake([{ data: [], count: 0 }]);
    await listDiscussions(client, { q: "  ", sort: "newest", page: 1 });
    expect(calls[0]!.ops.some((o) => o.op === "or")).toBe(false);
  });

  it("marks only the items this user liked or bookmarked, using separate own-row lookups", async () => {
    const { client, calls } = fake([
      { data: [row("d1"), row("d2")], count: 2 },
      { data: [{ discussion_id: "d2" }] },
      { data: [{ discussion_id: "d1" }] },
    ]);
    const res = await listDiscussions(client, { q: "", sort: "newest", page: 1 });
    expect(calls.map((c) => c.table)).toEqual(["discussions", "discussion_likes", "discussion_bookmarks"]);
    expect(res.status === "ok" && res.data.items.map((i) => [i.likedByMe, i.bookmarkedByMe])).toEqual([[false, true], [true, false]]);
  });

  it("returns an empty page, not an error, when the page is past the end", async () => {
    const { client } = fake([{ error: { code: "PGRST103", message: "Requested range not satisfiable" } }]);
    const res = await listDiscussions(client, { q: "", sort: "newest", page: 400 });
    expect(res).toEqual({ status: "ok", data: { items: [], total: 0, page: 400, pageSize: PAGE_SIZE } });
  });

  it("separates a missing schema from a real failure", async () => {
    expect((await listDiscussions(fake([{ error: { code: "42703", message: "column discussions.like_count does not exist" } }]).client, { q: "", sort: "newest", page: 1 })).status).toBe("unavailable");
    expect((await listDiscussions(fake([{ error: { code: "XX000", message: "boom" } }]).client, { q: "", sort: "newest", page: 1 })).status).toBe("error");
  });
});

describe("getMyDiscussionStates", () => {
  it("makes no query for no ids", async () => {
    const { client, calls } = fake([]);
    const s = await getMyDiscussionStates(client, []);
    expect(calls).toHaveLength(0);
    expect(s.liked.size + s.bookmarked.size).toBe(0);
  });
});

describe("listBookmarks", () => {
  it("reads the caller's rows newest first with an inner join and no user id in the query", async () => {
    const { client, calls } = fake([{
      data: [{ created_at: "2026-10-02T00:00:00Z", discussions: { id: "d1", title: "T", grade: 9, category: "climate" } }, { created_at: "x", discussions: null }],
      count: 1,
    }]);
    const res = await listBookmarks(client, 1);
    const ops = calls[0]!.ops;
    expect(calls[0]!.table).toBe("discussion_bookmarks");
    expect(String(ops.find((o) => o.op === "select")!.args[0])).toContain("discussions!inner");
    expect(ops.some((o) => o.op === "eq")).toBe(false); // ownership comes from RLS, not from a browser-supplied filter
    expect(res.status === "ok" && res.data.items.map((i) => i.id)).toEqual(["d1"]);
  });

  it("handles an out-of-range page and a missing table", async () => {
    expect((await listBookmarks(fake([{ error: { code: "PGRST103" } }]).client, 99)).status).toBe("ok");
    expect((await listBookmarks(fake([{ error: { code: "42P01", message: "relation does not exist" } }]).client, 1)).status).toBe("unavailable");
  });
});

describe("getMyReportedIds", () => {
  it("looks up only the given content type and ids, and returns the ids already reported", async () => {
    const { client, calls } = fake([{ data: [{ content_id: "r2" }] }]);
    const s = await getMyReportedIds(client, "reply", ["r1", "r2"]);
    expect(calls[0]!.table).toBe("forum_reports");
    expect(has(calls[0]!.ops, "eq", "content_type", "reply")).toBe(true);
    expect(has(calls[0]!.ops, "in", "content_id", ["r1", "r2"])).toBe(true);
    expect([...s]).toEqual(["r2"]);
  });
  it("makes no query for no ids and treats a failure as nothing reported", async () => {
    expect((await getMyReportedIds(fake([]).client, "discussion", [])).size).toBe(0);
    expect((await getMyReportedIds(fake([{ error: { code: "42P01" } }]).client, "discussion", ["d1"])).size).toBe(0);
  });
});
