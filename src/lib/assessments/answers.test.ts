import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type RpcRes = { data?: unknown; error?: { code?: string; message?: string } | null; throws?: boolean };
const state: { user: { id: string } | null; role: unknown; rpcQueue: RpcRes[]; rpcCalls: { fn: string; args: Record<string, unknown> }[] } = {
  user: { id: "s1" }, role: "student", rpcQueue: [], rpcCalls: [],
};
vi.mock("@/lib/supabase/env", () => ({ isSupabaseConfigured: () => true }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from: () => {
      const b: Record<string, unknown> = {};
      b.select = () => b;
      b.eq = () => b;
      b.maybeSingle = async () => ({ data: state.role === undefined ? null : { role: state.role }, error: null });
      return b;
    },
    rpc: async (fn: string, args: Record<string, unknown>) => {
      state.rpcCalls.push({ fn, args });
      const r = state.rpcQueue.shift() ?? {};
      if (r.throws) throw new Error('connection to "db.internal" failed: relation "question_answer_keys" missing');
      return { data: r.data ?? null, error: r.error ?? null };
    },
  }),
}));

import { getAttemptAnswersAction, saveAnswerAction } from "./answer-actions";
import { fromDbAnswer, mapAnswersSnapshot, mapSavedAnswer, saveFailureKind, toDbAnswer } from "./answers";
import { AnswerAutosaver, type SaveFn, type SaveOutcome } from "./autosave";

const ATT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const Q1 = "11111111-1111-4111-8111-111111111111";
const Q2 = "22222222-2222-4222-8222-222222222222";
const OPT = "33333333-3333-4333-8333-333333333333";

const savedRow = (over: Record<string, unknown> = {}) => ({
  applied: true, question_id: Q1, revision: 1, answer: { text: "hi" }, saved_at: "2026-10-19T10:00:00Z",
  server_now: "2026-10-19T10:00:01Z", expires_at: "2026-10-19T10:30:00Z", seconds_remaining: 1799, ...over,
});

beforeEach(() => { state.user = { id: "s1" }; state.role = "student"; state.rpcQueue = []; state.rpcCalls = []; });

describe("saveAnswerAction", () => {
  const input = { attemptId: ATT, questionId: Q1, answer: { text: "hi" }, revision: 1 };
  it("sends only attempt, question, converted answer and revision; never a user id", async () => {
    state.rpcQueue = [{ data: savedRow() }];
    const r = await saveAnswerAction({ ...input, userId: "other", user_id: "other" });
    expect(r.ok).toBe(true);
    expect(state.rpcCalls).toEqual([{ fn: "save_attempt_answer", args: { p_attempt: ATT, p_question: Q1, p_answer: { text: "hi" }, p_revision: 1 } }]);
  });
  it("refuses signed-out users and non-students without calling the database", async () => {
    state.user = null;
    expect(await saveAnswerAction(input)).toMatchObject({ ok: false, kind: "closed" });
    state.user = { id: "t" }; state.role = "teacher";
    expect(await saveAnswerAction(input)).toMatchObject({ ok: false, kind: "closed" });
    expect(state.rpcCalls).toHaveLength(0);
  });
  it.each([
    [{ ...input, attemptId: "x" }], [{ ...input, revision: 0 }], [{ ...input, revision: 1.5 }],
    [{ ...input, answer: { text: "a".repeat(10001) } }], [{ ...input, answer: { text: "x", optionId: OPT } }],
    [{ ...input, answer: { is_correct: true } }], [null], ["x"],
  ])("rejects malformed input %j before any rpc", async (bad) => {
    expect(await saveAnswerAction(bad)).toMatchObject({ ok: false, kind: "rejected" });
    expect(state.rpcCalls).toHaveLength(0);
  });
  it.each([["EA007", "closed"], ["EA005", "closed"], ["42501", "closed"], ["EA003", "closed"], ["EA009", "rejected"], ["EA008", "rejected"], ["XX000", "retry"], ["", "retry"]])(
    "maps database code %s to kind %s with fixed text", async (code, kind) => {
      state.rpcQueue = [{ error: { code, message: "raw secret relation question_answer_keys" } }];
      const r = await saveAnswerAction(input);
      expect(r).toMatchObject({ ok: false, kind });
      if (!r.ok) expect(r.error).not.toMatch(/relation|secret|question_answer_keys/);
    });
  it("a thrown error is transient and leaks nothing", async () => {
    state.rpcQueue = [{ throws: true }];
    const r = await saveAnswerAction(input);
    expect(r).toMatchObject({ ok: false, kind: "retry" });
    expect(JSON.stringify(r)).not.toMatch(/internal|relation/);
  });
  it("a malformed or extended success reply fails closed as retry", async () => {
    state.rpcQueue = [{ data: { ...savedRow(), is_correct: true } }];
    expect(await saveAnswerAction(input)).toMatchObject({ ok: false, kind: "retry" });
    state.rpcQueue = [{ data: savedRow({ answer: { option_id: 5 } }) }];
    expect(await saveAnswerAction(input)).toMatchObject({ ok: false, kind: "retry" });
  });
});

describe("getAttemptAnswersAction + mappers", () => {
  const snap = () => ({
    attempt: { attempt_id: ATT, status: "in_progress", expires_at: null, server_now: "2026-10-19T10:00:00Z", seconds_remaining: null },
    answers: [{ question_id: Q1, revision: 3, answer: { option_id: OPT }, saved_at: "2026-10-19T10:00:00Z" }, { question_id: Q2, revision: 1, answer: null, saved_at: null }],
  });
  it("restores answers", async () => {
    state.rpcQueue = [{ data: snap() }];
    const r = await getAttemptAnswersAction({ attemptId: ATT, userId: "x" });
    expect(state.rpcCalls).toEqual([{ fn: "get_attempt_answers", args: { p_attempt: ATT } }]);
    expect(r.ok && r.snapshot.answers[0]).toMatchObject({ questionId: Q1, revision: 3, answer: { optionId: OPT } });
  });
  it("rejects extra keys, duplicates, wrong status, bad shapes", () => {
    expect(mapAnswersSnapshot(snap())).not.toBeNull();
    expect(mapAnswersSnapshot({ ...snap(), extra: 1 })).toBeNull();
    const dup = snap(); dup.answers.push(dup.answers[0]!); expect(mapAnswersSnapshot(dup)).toBeNull();
    const sub = snap(); sub.attempt.status = "submitted"; expect(mapAnswersSnapshot(sub)).toBeNull();
    const bad = snap(); (bad.answers[0] as Record<string, unknown>).answer = { option_id: OPT, is_correct: true }; expect(mapAnswersSnapshot(bad)).toBeNull();
  });
  it("round-trips the four answer shapes", () => {
    for (const a of [{ optionId: OPT }, { optionIds: [OPT] }, { value: false }, { text: "x" }, null]) expect(fromDbAnswer(toDbAnswer(a))).toEqual(a);
    expect(fromDbAnswer({ value: "true" })).toBeUndefined();
    expect(mapSavedAnswer(savedRow({ revision: 0 }))).toBeNull();
  });
  it("classifies failures", () => { expect(saveFailureKind(undefined)).toBe("retry"); expect(saveFailureKind({ code: "EA007" })).toBe("closed"); });
});

describe("AnswerAutosaver", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  /** a fake server that applies the highest-revision-wins rule and can be told to fail */
  function server() {
    const stored = new Map<string, { revision: number; answer: unknown }>();
    const calls: { questionId: string; revision: number; answer: unknown }[] = [];
    const script: SaveOutcome[] = [];
    const fn: SaveFn = async (req) => {
      calls.push({ ...req });
      const next = script.shift();
      if (next) return next;
      const cur = stored.get(req.questionId);
      const applied = !cur || cur.revision < req.revision;
      if (applied) stored.set(req.questionId, { revision: req.revision, answer: req.answer });
      const now = stored.get(req.questionId)!;
      return { ok: true, saved: { questionId: req.questionId, revision: now.revision, answer: now.answer as never, applied, savedAt: null, serverNow: "t", expiresAt: null, secondsRemaining: null } };
    };
    return { fn, stored, calls, script };
  }
  const mk = (s: ReturnType<typeof server>, o = {}) => new AnswerAutosaver({ save: s.fn, random: () => 1, ...o });

  it("coalesces rapid typing into one request carrying the latest text", async () => {
    const s = server(); const a = mk(s);
    for (const t of ["a", "ab", "abc"]) a.setAnswer(Q1, { text: t });
    await vi.advanceTimersByTimeAsync(800);
    expect(s.calls).toEqual([{ questionId: Q1, revision: 3, answer: { text: "abc" } }]);
    expect(a.snapshot().questions[Q1]?.state).toBe("saved");
    expect(a.hasUnsaved()).toBe(false);
  });
  it("sends choices immediately and never has two requests in flight for one question", async () => {
    const s = server(); let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const slow: SaveFn = async (req) => { if (req.revision === 1) await gate; return s.fn(req); };
    const a = new AnswerAutosaver({ save: slow });
    a.setAnswer(Q1, { optionId: OPT }, { immediate: true });
    a.setAnswer(Q1, { optionId: Q2 }, { immediate: true });
    await vi.advanceTimersByTimeAsync(0);
    expect(s.calls).toHaveLength(0); // first still waiting, second held back
    release(); await vi.advanceTimersByTimeAsync(0);
    expect(s.calls.map((c) => c.revision)).toEqual([1, 2]);
    expect(s.stored.get(Q1)?.answer).toEqual({ optionId: Q2 });
  });
  it("retries the SAME request after a network failure with exponential backoff, then succeeds", async () => {
    const s = server(); const a = mk(s, { baseDelayMs: 1000 });
    s.script.push({ ok: false, kind: "retry", error: "x" }, { ok: false, kind: "retry", error: "x" });
    a.setAnswer(Q1, { value: true }, { immediate: true });
    await vi.advanceTimersByTimeAsync(0);
    expect(a.snapshot().questions[Q1]?.state).toBe("retrying");
    await vi.advanceTimersByTimeAsync(999); expect(s.calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1); expect(s.calls).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(2000); expect(s.calls).toHaveLength(3);
    expect(new Set(s.calls.map((c) => c.revision))).toEqual(new Set([1]));
    expect(a.snapshot().questions[Q1]?.state).toBe("saved");
  });
  it("a thrown error (offline) is retried; gives up after maxRetries, then retryNow / online recovers", async () => {
    let up = false; const calls: number[] = [];
    const fn: SaveFn = async (r) => { calls.push(r.revision); if (!up) throw new Error("offline"); return { ok: true, saved: { questionId: r.questionId, revision: r.revision, answer: r.answer, applied: true, savedAt: null, serverNow: "t", expiresAt: null, secondsRemaining: null } }; };
    const a = new AnswerAutosaver({ save: fn, maxRetries: 2, baseDelayMs: 10, random: () => 1 });
    a.setAnswer(Q1, { value: true }, { immediate: true });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(calls).toHaveLength(3);
    expect(a.snapshot().questions[Q1]).toMatchObject({ state: "failed" });
    expect(a.hasUnsaved()).toBe(true);
    up = true; a.notifyOnline(); await vi.advanceTimersByTimeAsync(0);
    expect(a.snapshot().questions[Q1]?.state).toBe("saved");
    expect(a.hasUnsaved()).toBe(false);
  });
  it("a closed attempt stops everything: no more requests, edits refused, unsaved reported", async () => {
    const s = server(); const a = mk(s);
    s.script.push({ ok: false, kind: "closed", error: "This attempt is no longer open." });
    a.setAnswer(Q1, { text: "late" }, { immediate: true });
    await vi.advanceTimersByTimeAsync(0);
    expect(a.snapshot()).toMatchObject({ closed: true, closedReason: "This attempt is no longer open.", unsaved: 1 });
    expect(a.setAnswer(Q2, { text: "x" }, { immediate: true })).toBe(false);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(s.calls).toHaveLength(1);
    expect(await a.flush()).toEqual({ ok: false, closed: true, unsaved: [Q1] });
  });
  it("a rejected answer is not retried; a new edit tries afresh", async () => {
    const s = server(); const a = mk(s);
    s.script.push({ ok: false, kind: "rejected", error: "bad" });
    a.setAnswer(Q1, { text: "x" }, { immediate: true });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(s.calls).toHaveLength(1);
    expect(a.snapshot().questions[Q1]?.state).toBe("rejected");
    a.setAnswer(Q1, { text: "y" }, { immediate: true });
    await vi.advanceTimersByTimeAsync(0);
    expect(a.snapshot().questions[Q1]?.state).toBe("saved");
  });
  it("flush sends pending edits immediately and reports ok only when all are confirmed", async () => {
    const s = server(); const a = mk(s);
    a.setAnswer(Q1, { text: "a" }); a.setAnswer(Q2, { value: true });
    const p = a.flush(); await vi.advanceTimersByTimeAsync(0);
    expect(await p).toEqual({ ok: true, closed: false, unsaved: [] });
    expect(s.calls).toHaveLength(2);
  });
  it("flush gives one immediate retry, then reports the unsaved question instead of hanging", async () => {
    const a = new AnswerAutosaver({ save: async () => { throw new Error("down"); } });
    a.setAnswer(Q1, { text: "a" });
    const p = a.flush(); await vi.advanceTimersByTimeAsync(0);
    expect(await p).toEqual({ ok: false, closed: false, unsaved: [Q1] });
  });
  it("hydrate restores answers but never overwrites what was typed; next revision outranks the stored one", async () => {
    const s = server(); const a = mk(s);
    a.setAnswer(Q1, { text: "typed" });
    a.hydrate([{ questionId: Q1, revision: 5, answer: { text: "old" }, savedAt: null }, { questionId: Q2, revision: 2, answer: { value: true }, savedAt: null }]);
    expect(a.getAnswer(Q1)).toEqual({ text: "typed" });
    expect(a.getAnswer(Q2)).toEqual({ value: true });
    await vi.advanceTimersByTimeAsync(800);
    expect(s.calls[0]).toMatchObject({ questionId: Q1, answer: { text: "typed" } });
    expect(s.calls[0]!.revision).toBeGreaterThan(5);
  });
  it("a stale revision (other tab) is re-sent higher so the latest edit here wins", async () => {
    const s = server(); s.stored.set(Q1, { revision: 7, answer: { text: "other tab" } });
    const a = mk(s);
    a.setAnswer(Q1, { text: "mine" }, { immediate: true });
    await vi.advanceTimersByTimeAsync(0);
    expect(s.stored.get(Q1)).toEqual({ revision: 8, answer: { text: "mine" } });
    expect(a.snapshot().questions[Q1]?.state).toBe("saved");
  });
  it("a duplicate reply (lost response, request repeated) is harmless", async () => {
    const s = server(); const a = mk(s);
    s.stored.set(Q1, { revision: 1, answer: { text: "same" } });
    a.setAnswer(Q1, { text: "same" }, { immediate: true });
    await vi.advanceTimersByTimeAsync(0);
    expect(s.calls).toHaveLength(1);
    expect(a.hasUnsaved()).toBe(false);
  });
  it("a reply about a different question is never applied", async () => {
    const a = new AnswerAutosaver({ save: async (r) => ({ ok: true, saved: { questionId: Q2, revision: r.revision, answer: r.answer, applied: true, savedAt: null, serverNow: "t", expiresAt: null, secondsRemaining: null } }), maxRetries: 0 });
    a.setAnswer(Q1, { text: "x" }, { immediate: true });
    await vi.advanceTimersByTimeAsync(0);
    expect(a.hasUnsaved()).toBe(true);
  });
  it("source has no browser globals and no secrets", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("src/lib/assessments/autosave.ts", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(src).not.toMatch(/\b(window|document|localStorage|sessionStorage|fetch)\b/);
  });
});
