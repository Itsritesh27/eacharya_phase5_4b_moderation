import { beforeEach, describe, expect, it, vi } from "vitest";

const state: {
  user: { id: string } | null; role: unknown;
  rpc: { data?: unknown; error?: { code?: string; message?: string } | null }[];
  rpcCalls: { fn: string; args: Record<string, unknown> }[]; tables: string[];
} = { user: { id: "session-user" }, role: "admin", rpc: [], rpcCalls: [], tables: [] };

vi.mock("@/lib/supabase/env", () => ({ isSupabaseConfigured: () => true }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from: (table: string) => {
      state.tables.push(table);
      const b: Record<string, unknown> = {};
      for (const op of ["select", "eq"]) b[op] = () => b;
      b.maybeSingle = async () => ({ data: state.role === undefined ? null : { role: state.role }, error: null });
      return b;
    },
    rpc: async (fn: string, args: Record<string, unknown>) => {
      state.rpcCalls.push({ fn, args });
      const r = state.rpc.shift() ?? {};
      return { data: r.data ?? null, error: r.error ?? null };
    },
  }),
}));

import { revalidatePath } from "next/cache";
import { moderateReportAction, restoreReportContentAction } from "./moderation-actions";

const RID = "44444444-4444-4444-8444-444444444444";

beforeEach(() => {
  state.user = { id: "session-user" }; state.role = "admin"; state.rpc = []; state.rpcCalls = []; state.tables = [];
  vi.mocked(revalidatePath).mockClear();
});

describe("authorization on every action", () => {
  it.each(["student", "teacher", "nonsense", null])("refuses role %s without calling the database function", async (role) => {
    state.role = role;
    const a = await moderateReportAction({ reportId: RID, status: "reviewed" });
    const b = await restoreReportContentAction({ reportId: RID });
    expect(a).toEqual({ ok: false, error: "You do not have permission to moderate the forum." });
    expect(b).toEqual({ ok: false, error: "You do not have permission to moderate the forum." });
    expect(state.rpcCalls).toHaveLength(0);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("refuses signed-out callers", async () => {
    state.user = null;
    expect(await moderateReportAction({ reportId: RID, status: "reviewed" })).toEqual({ ok: false, error: "Please sign in again to continue." });
    expect(state.rpcCalls).toHaveLength(0);
  });

  it("checks the role on the server for each call (a demoted admin is refused on the next call)", async () => {
    state.rpc = [{ data: { status: "reviewed", content_action: null } }];
    expect((await moderateReportAction({ reportId: RID, status: "reviewed" })).ok).toBe(true);
    state.role = "student";
    expect((await moderateReportAction({ reportId: RID, status: "reviewed" })).ok).toBe(false);
    expect(state.rpcCalls).toHaveLength(1);
  });

  it("does not reveal validation details to someone who is not allowed", async () => {
    state.role = "student";
    const res = await moderateReportAction({ reportId: "bad", status: "pending" });
    expect(res).toEqual({ ok: false, error: "You do not have permission to moderate the forum." });
  });
});

describe("moderateReportAction", () => {
  it("marks a report reviewed and sends no moderator id", async () => {
    state.rpc = [{ data: { status: "reviewed", content_action: null } }];
    const res = await moderateReportAction({ reportId: RID, status: "reviewed", moderatorId: "attacker", moderator_id: "attacker", reviewed_by: "attacker" });
    expect(res).toEqual({ ok: true, status: "reviewed", contentAction: null });
    expect(state.rpcCalls[0]).toEqual({ fn: "forum_moderate_report", args: { p_report_id: RID, p_status: "reviewed", p_note: null, p_hide_content: false } });
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/admin/forum-reports");
  });

  it("dismisses with a cleaned optional note", async () => {
    state.rpc = [{ data: { status: "dismissed", content_action: null } }];
    const res = await moderateReportAction({ reportId: RID, status: "dismissed", note: "  Not a problem \r\n " });
    expect(res.ok).toBe(true);
    expect(state.rpcCalls[0]!.args.p_note).toBe("Not a problem");
  });

  it("passes the hide flag only with action taken and reports that content was hidden", async () => {
    state.rpc = [{ data: { status: "action_taken", content_action: "hidden" } }];
    const res = await moderateReportAction({ reportId: RID, status: "action_taken", hideContent: true });
    expect(res).toEqual({ ok: true, status: "action_taken", contentAction: "hidden" });
    expect(state.rpcCalls[0]!.args.p_hide_content).toBe(true);
    expect(revalidatePath).toHaveBeenCalledWith("/forum");
  });

  it("rejects invalid input without calling the database function", async () => {
    for (const bad of [
      { reportId: "x", status: "reviewed" },
      { reportId: RID, status: "pending" },
      { reportId: RID, status: "bogus" },
      { reportId: RID, status: "dismissed", hideContent: true },
      { reportId: RID, status: "reviewed", note: "x".repeat(1001) },
    ]) expect((await moderateReportAction(bad)).ok).toBe(false);
    expect(state.rpcCalls).toHaveLength(0);
  });

  it("shows the database's plain reason for an invalid or conflicting move, and refreshes a stale queue", async () => {
    state.rpc = [{ error: { code: "23514", message: 'This report is already "dismissed" and cannot be changed to "reviewed".' } }];
    const res = await moderateReportAction({ reportId: RID, status: "reviewed" });
    expect(res).toEqual({ ok: false, error: 'This report is already "dismissed" and cannot be changed to "reviewed".' });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("explains a missing report, a deleted post and a database permission refusal, and hides raw errors", async () => {
    state.rpc = [{ error: { code: "P0002", message: "x" } }];
    expect(await moderateReportAction({ reportId: RID, status: "reviewed" })).toEqual({ ok: false, error: "This report no longer exists." });
    state.rpc = [{ error: { code: "23514", message: "The reported content no longer exists, so it cannot be hidden. Mark the report without hiding." } }];
    const gone = await moderateReportAction({ reportId: RID, status: "action_taken", hideContent: true });
    expect(gone.ok === false && gone.error).toMatch(/no longer exists/);
    state.rpc = [{ error: { code: "42501", message: "denied" } }];
    expect((await moderateReportAction({ reportId: RID, status: "reviewed" })).ok).toBe(false);
    state.rpc = [{ error: { code: "XX000", message: "host 10.0.0.9 down" } }];
    const raw = await moderateReportAction({ reportId: RID, status: "reviewed" });
    expect(raw.ok === false && raw.error).not.toMatch(/10\.0\.0\.9/);
    state.rpc = [{ error: { code: "42883", message: "function does not exist" } }];
    const missing = await moderateReportAction({ reportId: RID, status: "reviewed" });
    expect(missing.ok === false && missing.error).toMatch(/not available yet/);
  });

  it("never reports success when the database call fails", async () => {
    state.rpc = [{ error: { code: "XX000", message: "boom" } }];
    expect((await moderateReportAction({ reportId: RID, status: "reviewed" })).ok).toBe(false);
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("restoreReportContentAction", () => {
  it("restores through the database function and reports it", async () => {
    state.rpc = [{ data: { status: "action_taken", content_action: "restored" } }];
    const res = await restoreReportContentAction({ reportId: RID, note: "Mistake" });
    expect(res).toEqual({ ok: true, status: "action_taken", contentAction: "restored" });
    expect(state.rpcCalls[0]).toEqual({ fn: "forum_restore_report_content", args: { p_report_id: RID, p_note: "Mistake" } });
  });
  it("rejects a bad id and surfaces refusals", async () => {
    expect((await restoreReportContentAction({ reportId: "x" })).ok).toBe(false);
    state.rpc = [{ error: { code: "23514", message: "This content is already visible." } }];
    expect(await restoreReportContentAction({ reportId: RID })).toEqual({ ok: false, error: "This content is already visible." });
  });
});
