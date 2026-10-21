import { beforeEach, describe, expect, it, vi } from "vitest";

type Res = { data?: unknown; error?: { code?: string; message?: string } | null };
type Call = { table: string; ops: { op: string; args: unknown[] }[] };

const state: { user: { id: string } | null; queue: Record<string, Res[]>; calls: Call[] } = {
  user: { id: "session-user" },
  queue: {},
  calls: [],
};

vi.mock("@/lib/supabase/env", () => ({ isSupabaseConfigured: () => true }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from: (table: string) => {
      const call: Call = { table, ops: [] };
      state.calls.push(call);
      const b: Record<string, unknown> = {};
      for (const op of ["select", "insert", "update", "delete", "eq", "maybeSingle"]) {
        b[op] = (...args: unknown[]) => {
          call.ops.push({ op, args });
          return b;
        };
      }
      b.then = (resolve: (v: unknown) => unknown) => {
        const r = state.queue[table]?.shift() ?? {};
        return resolve({ data: r.data ?? null, error: r.error ?? null });
      };
      return b;
    },
  }),
}));

import {
  enrollAction,
  markLessonCompleteAction,
  saveLessonPositionAction,
  saveNoteAction,
  setBookmarkAction,
  unenrollAction,
  updateProfileNameAction,
} from "./actions";

const ID = "33333333-3333-4333-8333-333333333333";
const ID2 = "44444444-4444-4444-8444-444444444444";
const DUP = { code: "23505", message: "duplicate" };
const RLS = { code: "42501", message: "new row violates row-level security policy" };

const q = (table: string, ...r: Res[]) => (state.queue[table] = r);
const ops = (c: Call) => c.ops.map((o) => o.op);
const arg = (c: Call, op: string) => c.ops.find((o) => o.op === op)?.args[0];
const eqs = (c: Call) => c.ops.filter((o) => o.op === "eq").map((o) => o.args);

beforeEach(() => {
  state.user = { id: "session-user" };
  state.queue = {};
  state.calls = [];
});

describe("every action refuses signed-out callers and invalid ids before touching tables", () => {
  const SIGN_IN = { ok: false, error: "Please sign in again to continue." };
  it("signed out", async () => {
    state.user = null;
    const results = await Promise.all([
      enrollAction(ID),
      unenrollAction(ID),
      markLessonCompleteAction(ID),
      saveLessonPositionAction(ID, 5),
      setBookmarkAction({ lessonId: ID, bookmarked: true }),
      saveNoteAction({ lessonId: ID, body: "x" }),
      updateProfileNameAction({ fullName: "Asha Rao" }),
    ]);
    for (const r of results) expect(r).toEqual(SIGN_IN);
    expect(state.calls).toHaveLength(0);
  });

  it("invalid ids", async () => {
    expect((await enrollAction("nope")).ok).toBe(false);
    expect((await unenrollAction({})).ok).toBe(false);
    expect((await markLessonCompleteAction(null)).ok).toBe(false);
    expect((await saveLessonPositionAction("x", 1)).ok).toBe(false);
    expect(state.calls).toHaveLength(0);
  });
});

describe("enrolment", () => {
  it("enrols using the session user id, ignoring any user id in the request", async () => {
    expect(await enrollAction(ID)).toEqual({ ok: true });
    expect(arg(state.calls[0]!, "insert")).toEqual({ user_id: "session-user", course_id: ID });
  });

  it("treats a duplicate enrolment as success", async () => {
    q("enrollments", { error: DUP });
    expect(await enrollAction(ID)).toEqual({ ok: true });
  });

  it("reports a refused enrolment (RLS) without exposing the database message", async () => {
    q("enrollments", { error: RLS });
    expect(await enrollAction(ID)).toEqual({ ok: false, error: "You can't enrol in this course." });
  });

  it("unenrols only the caller's own row", async () => {
    expect(await unenrollAction(ID)).toEqual({ ok: true });
    expect(eqs(state.calls[0]!)).toEqual([["user_id", "session-user"], ["course_id", ID]]);
  });

  it("reports unenrol errors", async () => {
    q("enrollments", { error: RLS });
    expect((await unenrollAction(ID)).ok).toBe(false);
  });
});

describe("markLessonCompleteAction", () => {
  it("does nothing when already completed", async () => {
    q("lesson_progress", { data: { status: "completed" } });
    expect(await markLessonCompleteAction(ID)).toEqual({ ok: true });
    expect(state.calls).toHaveLength(1);
  });

  it("updates an existing row", async () => {
    q("lesson_progress", { data: { status: "in_progress" } }, { data: [{ lesson_id: ID }] });
    expect(await markLessonCompleteAction(ID)).toEqual({ ok: true });
    expect(ops(state.calls[1]!)).toContain("update");
    expect(state.calls.some((c) => ops(c).includes("insert"))).toBe(false);
    expect(arg(state.calls[1]!, "update")).toMatchObject({ status: "completed" });
    expect(eqs(state.calls[1]!)).toEqual([["user_id", "session-user"], ["lesson_id", ID]]);
  });

  it("inserts for the session user when no row exists", async () => {
    q("lesson_progress", { data: null }, { data: [] }, {});
    expect(await markLessonCompleteAction(ID)).toEqual({ ok: true });
    expect(arg(state.calls[2]!, "insert")).toMatchObject({ user_id: "session-user", lesson_id: ID, status: "completed" });
  });

  it("recovers from a double-click race (duplicate on insert)", async () => {
    q("lesson_progress", { data: null }, { data: [] }, { error: DUP }, {});
    expect(await markLessonCompleteAction(ID)).toEqual({ ok: true });
    expect(ops(state.calls[3]!)).toContain("update");
  });

  it("asks to enrol when RLS refuses the write", async () => {
    q("lesson_progress", { data: null }, { data: [] }, { error: RLS });
    expect(await markLessonCompleteAction(ID)).toEqual({ ok: false, error: "Enrol in this course to track your progress." });
  });

  it("asks to enrol when the update is refused", async () => {
    q("lesson_progress", { data: null }, { error: RLS });
    expect((await markLessonCompleteAction(ID)).ok).toBe(false);
  });
});

describe("saveLessonPositionAction", () => {
  it("clamps garbage positions", async () => {
    q("lesson_progress", { data: [{ lesson_id: ID }] });
    expect((await saveLessonPositionAction(ID, -50)).ok).toBe(true);
    const upd = arg(state.calls[0]!, "update") as { position_seconds: number };
    expect(upd.position_seconds).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(upd.position_seconds)).toBe(true);
  });

  it("never writes a status when updating (cannot un-complete a lesson)", async () => {
    q("lesson_progress", { data: [{ lesson_id: ID }] });
    await saveLessonPositionAction(ID, 12);
    expect(Object.keys(arg(state.calls[0]!, "update") as object)).not.toContain("status");
  });

  it("creates an in-progress row when none exists", async () => {
    q("lesson_progress", { data: [] }, {});
    expect((await saveLessonPositionAction(ID, 12)).ok).toBe(true);
    expect(arg(state.calls[1]!, "insert")).toMatchObject({ user_id: "session-user", lesson_id: ID, status: "in_progress" });
  });

  it("tolerates a duplicate on insert but reports other failures", async () => {
    q("lesson_progress", { data: [] }, { error: DUP });
    expect((await saveLessonPositionAction(ID, 1)).ok).toBe(true);
    q("lesson_progress", { data: [] }, { error: RLS });
    expect((await saveLessonPositionAction(ID, 1)).ok).toBe(false);
  });
});

describe("setBookmarkAction", () => {
  it.each([
    ["neither item", { bookmarked: true }],
    ["both items", { lessonId: ID, resourceId: ID2, bookmarked: true }],
    ["bad id", { lessonId: "x", bookmarked: true }],
    ["missing flag", { lessonId: ID }],
  ])("rejects %s", async (_n, input) => {
    expect(await setBookmarkAction(input)).toEqual({ ok: false, error: "Invalid bookmark." });
    expect(state.calls).toHaveLength(0);
  });

  it("adds a lesson bookmark for the session user", async () => {
    expect(await setBookmarkAction({ lessonId: ID, bookmarked: true, userId: "attacker" })).toEqual({ ok: true });
    expect(arg(state.calls[0]!, "insert")).toEqual({ user_id: "session-user", lesson_id: ID, resource_id: null });
  });

  it("adds a resource bookmark", async () => {
    await setBookmarkAction({ resourceId: ID2, bookmarked: true });
    expect(arg(state.calls[0]!, "insert")).toEqual({ user_id: "session-user", lesson_id: null, resource_id: ID2 });
  });

  it("is idempotent on duplicates", async () => {
    q("bookmarks", { error: DUP });
    expect((await setBookmarkAction({ lessonId: ID, bookmarked: true })).ok).toBe(true);
  });

  it("removes only the caller's bookmark", async () => {
    expect((await setBookmarkAction({ resourceId: ID2, bookmarked: false })).ok).toBe(true);
    expect(ops(state.calls[0]!)).toContain("delete");
    expect(eqs(state.calls[0]!)).toEqual([["user_id", "session-user"], ["resource_id", ID2]]);
  });

  it("reports database errors generically", async () => {
    q("bookmarks", { error: RLS });
    expect(await setBookmarkAction({ lessonId: ID, bookmarked: true })).toEqual({ ok: false, error: "Could not add the bookmark." });
  });
});

describe("saveNoteAction", () => {
  it("rejects notes over 5000 characters", async () => {
    const res = await saveNoteAction({ lessonId: ID, body: "x".repeat(5001) });
    expect(res.ok).toBe(false);
    expect(state.calls).toHaveLength(0);
  });

  it("deletes the note when the body is blank", async () => {
    expect((await saveNoteAction({ lessonId: ID, body: "   \n " })).ok).toBe(true);
    expect(ops(state.calls[0]!)).toContain("delete");
    expect(eqs(state.calls[0]!)).toEqual([["user_id", "session-user"], ["lesson_id", ID]]);
  });

  it("updates an existing note with trimmed text", async () => {
    q("lesson_notes", { data: [{ lesson_id: ID }] });
    expect((await saveNoteAction({ lessonId: ID, body: "  hello  " })).ok).toBe(true);
    expect(arg(state.calls[0]!, "update")).toEqual({ body: "hello" });
    expect(state.calls).toHaveLength(1);
  });

  it("inserts a new note for the session user", async () => {
    q("lesson_notes", { data: [] }, {});
    expect((await saveNoteAction({ lessonId: ID, body: "hi" })).ok).toBe(true);
    expect(arg(state.calls[1]!, "insert")).toEqual({ user_id: "session-user", lesson_id: ID, body: "hi" });
  });

  it("asks to enrol when RLS refuses a new note", async () => {
    q("lesson_notes", { data: [] }, { error: RLS });
    expect(await saveNoteAction({ lessonId: ID, body: "hi" })).toEqual({ ok: false, error: "Enrol in this course to save notes." });
  });
});

describe("updateProfileNameAction", () => {
  it("writes only full_name, for the session user", async () => {
    const res = await updateProfileNameAction({ fullName: "  Asha Rao ", role: "admin", id: "other" });
    expect(res).toEqual({ ok: true });
    expect(state.calls[0]!.table).toBe("profiles");
    expect(arg(state.calls[0]!, "update")).toEqual({ full_name: "Asha Rao" });
    expect(eqs(state.calls[0]!)).toEqual([["id", "session-user"]]);
  });

  it.each(["", "A", "x".repeat(121)])("rejects name %j", async (fullName) => {
    expect((await updateProfileNameAction({ fullName })).ok).toBe(false);
    expect(state.calls).toHaveLength(0);
  });

  it("reports database errors generically", async () => {
    q("profiles", { error: RLS });
    expect(await updateProfileNameAction({ fullName: "Asha Rao" })).toEqual({ ok: false, error: "Could not update your name." });
  });
});
