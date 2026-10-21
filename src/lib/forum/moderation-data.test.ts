import { describe, expect, it } from "vitest";
import { contentFrom, getStatusCounts, listReports } from "./moderation-data";
import { MODERATION_PAGE_SIZE, type ReportFilters } from "./moderation";

interface Op { op: string; args: unknown[] }
type Result = { data?: unknown; error?: { code?: string; message?: string } | null; count?: number | null };

function fake(queue: Result[]) {
  const calls: { table: string; ops: Op[] }[] = [];
  const client = {
    from(table: string) {
      const call = { table, ops: [] as Op[] };
      calls.push(call);
      const result = queue.shift() ?? {};
      const b: Record<string, unknown> = {};
      for (const op of ["select", "eq", "order", "range", "in"]) b[op] = (...args: unknown[]) => { call.ops.push({ op, args }); return b; };
      b.then = (resolve: (v: unknown) => unknown) => resolve({ data: result.data ?? null, error: result.error ?? null, count: result.count ?? null });
      return b;
    },
  };
  return { client: client as never, calls };
}
const has = (ops: Op[], op: string, ...args: unknown[]) => ops.some((o) => o.op === op && args.every((a, i) => JSON.stringify(o.args[i]) === JSON.stringify(a)));
const base: ReportFilters = { status: "pending", sort: "newest", page: 1 };

const row = (over: Record<string, unknown> = {}) => ({
  id: "r1", reporter_id: "u1", content_type: "discussion", reason: "spam", description: "ad", status: "pending",
  created_at: "2026-10-01T00:00:00Z", reported_discussion_id: "d1", reported_reply_id: null,
  discussions: { id: "d1", title: "Monsoon", is_hidden: false }, discussion_replies: null, ...over,
});

describe("listReports", () => {
  it("applies status, type and reason filters in the database", async () => {
    const { client, calls } = fake([{ data: [], count: 0 }]);
    await listReports(client, { status: "reviewed", type: "reply", reason: "abusive", sort: "newest", page: 1 });
    const ops = calls[0]!.ops;
    expect(calls[0]!.table).toBe("forum_reports");
    expect(has(ops, "eq", "status", "reviewed") && has(ops, "eq", "content_type", "reply") && has(ops, "eq", "reason", "abusive")).toBe(true);
  });

  it("adds no filter for 'all' statuses, type or reason", async () => {
    const { client, calls } = fake([{ data: [], count: 0 }]);
    await listReports(client, { sort: "newest", page: 1 });
    expect(calls[0]!.ops.some((o) => o.op === "eq")).toBe(false);
  });

  it("sorts newest first or oldest first with a stable id tiebreak", async () => {
    const a = fake([{ data: [], count: 0 }]); await listReports(a.client, base);
    expect(a.calls[0]!.ops.filter((o) => o.op === "order").map((o) => JSON.stringify(o.args))).toEqual(['["created_at",{"ascending":false}]', '["id",{"ascending":false}]']);
    const b = fake([{ data: [], count: 0 }]); await listReports(b.client, { ...base, sort: "oldest" });
    expect(b.calls[0]!.ops.filter((o) => o.op === "order").map((o) => JSON.stringify(o.args))).toEqual(['["created_at",{"ascending":true}]', '["id",{"ascending":true}]']);
  });

  it("reads one page at a time using the real total", async () => {
    const { client, calls } = fake([{ data: [row()], count: 37 }, { data: [] }, { data: [] }]);
    const res = await listReports(client, { ...base, page: 3 });
    expect(has(calls[0]!.ops, "range", 2 * MODERATION_PAGE_SIZE, 3 * MODERATION_PAGE_SIZE - 1)).toBe(true);
    expect(res.status === "ok" && res.data.total).toBe(37);
  });

  it("returns an empty page when the page is past the end, and separates a missing schema from a failure", async () => {
    expect((await listReports(fake([{ error: { code: "PGRST103" } }]).client, { ...base, page: 99 })).status).toBe("ok");
    expect((await listReports(fake([{ error: { code: "42P01", message: "relation does not exist" } }]).client, base)).status).toBe("unavailable");
    expect((await listReports(fake([{ error: { code: "XX000", message: "boom" } }]).client, base)).status).toBe("error");
  });

  it("exposes only a display name for the reporter, never an id or email, and attaches history with moderator names", async () => {
    const { client } = fake([
      { data: [row()], count: 1 },
      { data: [{ id: "u1", full_name: "Asha" }] },
      { data: [{ id: "e1", report_id: "r1", moderator_id: "m1", from_status: "pending", to_status: "reviewed", content_action: null, note: "ok", created_at: "2026-10-02T00:00:00Z" }] },
      { data: [{ id: "m1", full_name: "Dev Admin" }] },
    ]);
    const res = await listReports(client, base);
    if (res.status !== "ok") throw new Error("expected ok");
    const r = res.data.items[0]!;
    expect(r.reporterName).toBe("Asha");
    expect(JSON.stringify(r)).not.toMatch(/reporter_id|reporterId|"u1"|@/);
    expect(r.events[0]).toMatchObject({ moderatorName: "Dev Admin", toStatus: "reviewed", note: "ok" });
  });

  it("copes with a deleted reporter account", async () => {
    const { client } = fake([{ data: [row()], count: 1 }, { data: [] }, { data: [] }]);
    const res = await listReports(client, base);
    expect(res.status === "ok" && res.data.items[0]!.reporterName).toBe("Former member");
  });
});

describe("reported content states", () => {
  it("links to an existing discussion, flags a hidden one, and reports a deleted one", () => {
    expect(contentFrom(row() as never)).toEqual({ state: "available", title: "Monsoon", href: "/forum/d1" });
    expect(contentFrom(row({ discussions: { id: "d1", title: "T", is_hidden: true } }) as never).state).toBe("hidden");
    const gone = contentFrom(row({ discussions: null, reported_discussion_id: null }) as never);
    expect(gone).toEqual({ state: "deleted" });
    expect(gone.href).toBeUndefined();
  });
  it("links a reply to its discussion and anchor, and handles a deleted reply", () => {
    const reply = row({ content_type: "reply", discussions: null, discussion_replies: { id: "p1", body: "Hello there", is_hidden: false, discussion_id: "d9" } });
    expect(contentFrom(reply as never)).toEqual({ state: "available", excerpt: "Hello there", href: "/forum/d9#reply-p1" });
    expect(contentFrom({ ...reply, discussion_replies: null } as never)).toEqual({ state: "deleted" });
  });
});

describe("getStatusCounts", () => {
  it("counts each status separately without loading rows", async () => {
    const { client, calls } = fake([{ count: 5 }, { count: 2 }, { count: 7 }, { count: 1 }]);
    const res = await getStatusCounts(client);
    expect(res).toEqual({ status: "ok", data: { pending: 5, reviewed: 2, dismissed: 7, action_taken: 1 } });
    expect(calls.every((c) => c.table === "forum_reports")).toBe(true);
    expect(JSON.stringify(calls[0]!.ops[0]!.args)).toContain('"head":true');
  });
  it("reports a failure instead of showing wrong numbers", async () => {
    expect((await getStatusCounts(fake([{ count: 1 }, { error: { code: "XX000" } }, { count: 1 }, { count: 1 }]).client)).status).toBe("error");
  });
});
