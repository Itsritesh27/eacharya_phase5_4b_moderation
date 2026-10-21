import { beforeEach, describe, expect, it, vi } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

type RpcRes = { data?: unknown; error?: { code?: string; message?: string } | null };

const state: {
  user: { id: string } | null;
  role: unknown;
  configured: boolean;
  rpcQueue: RpcRes[];
  rpcCalls: { fn: string; args: Record<string, unknown> }[];
  fromCalls: { table: string; ops: string[] }[];
} = { user: { id: "student-1" }, role: "student", configured: true, rpcQueue: [], rpcCalls: [], fromCalls: [] };

vi.mock("@/lib/supabase/env", () => ({ isSupabaseConfigured: () => state.configured }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from: (table: string) => {
      const call = { table, ops: [] as string[] };
      state.fromCalls.push(call);
      const b: Record<string, unknown> = {};
      for (const op of ["select", "insert", "update", "delete", "upsert", "eq"]) {
        b[op] = () => {
          call.ops.push(op);
          return b;
        };
      }
      b.maybeSingle = async () => ({ data: state.role === undefined ? null : { role: state.role }, error: null });
      return b;
    },
    rpc: async (fn: string, args: Record<string, unknown>) => {
      state.rpcCalls.push({ fn, args });
      const r = state.rpcQueue.shift() ?? {};
      return { data: r.data ?? null, error: r.error ?? null };
    },
  }),
}));

import {
  getAttemptAction,
  getAttemptPaperAction,
  getOpenAttemptAction,
  startAttemptAction,
  submitAttemptAction,
} from "./attempt-actions";

const ASM = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ATT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const KEY = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const row = (over: Record<string, unknown> = {}) => ({
  attempt_id: ATT,
  assessment_id: ASM,
  attempt_number: 1,
  status: "in_progress",
  started_at: "2026-10-19T10:00:00+00:00",
  expires_at: "2026-10-19T10:30:00+00:00",
  submitted_at: null,
  server_now: "2026-10-19T10:00:01+00:00",
  seconds_remaining: 1799,
  resumed: false,
  ...over,
});

beforeEach(() => {
  state.user = { id: "student-1" };
  state.role = "student";
  state.configured = true;
  state.rpcQueue = [];
  state.rpcCalls = [];
  state.fromCalls = [];
});

describe.each([
  ["startAttemptAction", (i: unknown) => startAttemptAction(i), { assessmentId: ASM }],
  ["getAttemptAction", (i: unknown) => getAttemptAction(i), { attemptId: ATT }],
  ["getOpenAttemptAction", (i: unknown) => getOpenAttemptAction(i), { assessmentId: ASM }],
  ["submitAttemptAction", (i: unknown) => submitAttemptAction(i), { attemptId: ATT }],
  ["getAttemptPaperAction", (i: unknown) => getAttemptPaperAction(i), { attemptId: ATT }],
] as const)("%s authorisation", (_name, run, valid) => {
  it("refuses when Supabase is not configured, without calling the database", async () => {
    state.configured = false;
    const r = await run(valid);
    expect(r.ok).toBe(false);
    expect(state.rpcCalls).toHaveLength(0);
  });
  it("refuses a signed-out caller without calling the database", async () => {
    state.user = null;
    expect((await run(valid)).ok).toBe(false);
    expect(state.rpcCalls).toHaveLength(0);
  });
  it.each(["teacher", "admin", undefined, null])("refuses role %s before any RPC", async (role) => {
    state.role = role;
    expect((await run(valid)).ok).toBe(false);
    expect(state.rpcCalls).toHaveLength(0);
  });
  it("rejects malformed input before any RPC", async () => {
    for (const bad of [null, {}, { assessmentId: "x", attemptId: "y" }, "str", { attemptId: "1;drop table" }]) {
      expect((await run(bad)).ok).toBe(false);
    }
    expect(state.rpcCalls).toHaveLength(0);
  });
});

describe("startAttemptAction", () => {
  it("calls only start_assessment_attempt with the assessment and request key, and no user id", async () => {
    state.rpcQueue = [{ data: row() }];
    const r = await startAttemptAction({ assessmentId: ASM, requestKey: KEY });
    expect(r.ok).toBe(true);
    expect(state.rpcCalls).toEqual([{ fn: "start_assessment_attempt", args: { p_assessment: ASM, p_request_key: KEY } }]);
    expect(JSON.stringify(state.rpcCalls)).not.toMatch(/student-1|user/i);
  });
  it("sends a null request key when none is given", async () => {
    state.rpcQueue = [{ data: row() }];
    await startAttemptAction({ assessmentId: ASM });
    expect(state.rpcCalls[0]!.args).toEqual({ p_assessment: ASM, p_request_key: null });
  });
  it("ignores a client-supplied user id", async () => {
    state.rpcQueue = [{ data: row() }];
    await startAttemptAction({ assessmentId: ASM, userId: "victim", user_id: "victim" });
    expect(state.rpcCalls[0]!.args).toEqual({ p_assessment: ASM, p_request_key: null });
  });
  it("returns the mapped attempt, including resumed", async () => {
    state.rpcQueue = [{ data: row({ resumed: true, attempt_number: 2 }) }];
    const r = await startAttemptAction({ assessmentId: ASM });
    expect(r).toMatchObject({ ok: true, attempt: { attemptId: ATT, attemptNumber: 2, resumed: true, status: "in_progress" } });
  });
  it.each([
    ["EA001", /not available/i],
    ["EA002", /not opened/i],
    ["EA003", /closed/i],
    ["EA004", /used all/i],
    ["42501", /student account/i],
  ])("maps database error %s to fixed wording", async (code, re) => {
    state.rpcQueue = [{ error: { code, message: "internal: relation public.assessment_attempts detail" } }];
    const r = await startAttemptAction({ assessmentId: ASM });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toMatch(re);
      expect(r.error).not.toMatch(/relation|internal|public\./);
    }
  });
  it("never leaks a raw/unknown database error", async () => {
    state.rpcQueue = [{ error: { code: "23505", message: 'duplicate key value violates unique constraint "assessment_attempts_one_open_idx"' } }];
    const r = await startAttemptAction({ assessmentId: ASM });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).not.toMatch(/duplicate|constraint|idx/i);
  });
  it("fails closed when the database returns nothing or garbage", async () => {
    for (const data of [null, {}, [], { attempt_id: ATT }, { ...row(), status: "graded" }]) {
      state.rpcQueue = [{ data }];
      expect((await startAttemptAction({ assessmentId: ASM })).ok).toBe(false);
    }
  });
  it("a retry with the same key sends the same key (idempotency is the server's job)", async () => {
    state.rpcQueue = [{ data: row() }, { data: row({ resumed: true }) }];
    await startAttemptAction({ assessmentId: ASM, requestKey: KEY });
    await startAttemptAction({ assessmentId: ASM, requestKey: KEY });
    expect(state.rpcCalls.map((c) => c.args.p_request_key)).toEqual([KEY, KEY]);
  });
});

describe("getAttemptAction / getOpenAttemptAction / submitAttemptAction", () => {
  it("get calls get_my_attempt with only the attempt id", async () => {
    state.rpcQueue = [{ data: row() }];
    expect((await getAttemptAction({ attemptId: ATT })).ok).toBe(true);
    expect(state.rpcCalls).toEqual([{ fn: "get_my_attempt", args: { p_attempt: ATT } }]);
  });
  it("someone else's attempt returns the same fixed message as a missing one", async () => {
    state.rpcQueue = [{ error: { code: "EA005", message: "Attempt not found." } }];
    const r = await getAttemptAction({ attemptId: ATT });
    expect(r).toEqual({ ok: false, error: "We could not find that attempt." });
  });
  it("open returns attempt: null when there is none", async () => {
    state.rpcQueue = [{ data: [] }];
    expect(await getOpenAttemptAction({ assessmentId: ASM })).toEqual({ ok: true, attempt: null });
    expect(state.rpcCalls[0]).toEqual({ fn: "get_my_open_attempt", args: { p_assessment: ASM } });
  });
  it("open returns the single mapped attempt", async () => {
    state.rpcQueue = [{ data: [row()] }];
    expect(await getOpenAttemptAction({ assessmentId: ASM })).toMatchObject({ ok: true, attempt: { attemptId: ATT } });
  });
  it("open fails closed if the server ever returned more than one open attempt", async () => {
    state.rpcQueue = [{ data: [row(), row({ attempt_id: KEY })] }];
    expect((await getOpenAttemptAction({ assessmentId: ASM })).ok).toBe(false);
  });
  it("submit calls submit_attempt with only the attempt id and reports expired honestly", async () => {
    state.rpcQueue = [{ data: row({ status: "expired", seconds_remaining: 0 }) }];
    const r = await submitAttemptAction({ attemptId: ATT });
    expect(state.rpcCalls).toEqual([{ fn: "submit_attempt", args: { p_attempt: ATT } }]);
    expect(r).toMatchObject({ ok: true, attempt: { status: "expired", submittedAt: null } });
  });
});

describe("submitAttemptAction error handling", () => {
  it("logs the real database code server-side but returns only the generic message for an unexpected failure", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    state.rpcQueue = [{ error: { code: "42703", message: 'record "ans" has no field "selected_option_ids"' } }];
    const r = await submitAttemptAction({ attemptId: ATT });
    expect(r).toEqual({ ok: false, error: "Something went wrong. Please try again." });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(String(spy.mock.calls[0]?.[0])).toContain("code=42703");
    expect(JSON.stringify(r)).not.toContain("selected_option_ids");
    spy.mockRestore();
  });
  it("shows a specific message when the attempt cannot be scored (23514)", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    state.rpcQueue = [{ error: { code: "23514", message: "Assessment has no scorable marks" } }];
    const r = await submitAttemptAction({ attemptId: ATT });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/could not be scored/);
    spy.mockRestore();
  });
  it("shows the existing friendly message for a closed attempt (EA007)", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    state.rpcQueue = [{ error: { code: "EA007", message: "x" } }];
    expect(await submitAttemptAction({ attemptId: ATT })).toEqual({ ok: false, error: "This attempt is no longer open." });
    spy.mockRestore();
  });
});

describe("no direct table access and no privileged credentials", () => {
  it("actions never write to a table directly (only profiles is read, for the role)", async () => {
    state.rpcQueue = [{ data: row() }, { data: row() }, { data: [row()] }, { data: row({ status: "submitted" }) }];
    await startAttemptAction({ assessmentId: ASM });
    await getAttemptAction({ attemptId: ATT });
    await getOpenAttemptAction({ assessmentId: ASM });
    await submitAttemptAction({ attemptId: ATT });
    expect(state.fromCalls.every((c) => c.table === "profiles")).toBe(true);
    expect(state.fromCalls.flatMap((c) => c.ops).every((op) => op === "select" || op === "eq")).toBe(true);
  });

  it("no service-role key or client is referenced anywhere under src/", () => {
    // Real references only: the env var name, the Postgres role name, a camelCase identifier. Comments are ignored.
    const needle = new RegExp(["SERVICE_ROLE", "service_role", "serviceRole"].join("|"));
    const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx|js|jsx|mjs)$/.test(name) && !/attempt-actions\.test\.ts$/.test(name)) {
          if (needle.test(strip(readFileSync(p, "utf8")))) hits.push(p);
        }
      }
    };
    walk(join(process.cwd(), "src"));
    expect(hits).toEqual([]);
  });

  it("the attempt action files do not expose answers, scores or keys", () => {
    for (const f of ["attempt-actions.ts", "attempts.ts"]) {
      const src = readFileSync(join(process.cwd(), "src/lib/assessments", f), "utf8");
      expect(src).not.toMatch(/question_answer_keys|question_correct_options|correct_boolean|accepted_answers/);
    }
  });
});

// ---------------------------------------------------------------
// Phase C2: getAttemptPaperAction
// ---------------------------------------------------------------
const paperJson = (over: Record<string, unknown> = {}) => ({
  attempt: {
    attempt_id: ATT,
    assessment_id: ASM,
    attempt_number: 1,
    status: "in_progress",
    started_at: "2026-10-19T10:00:00+00:00",
    expires_at: "2026-10-19T10:30:00+00:00",
    server_now: "2026-10-19T10:00:01+00:00",
    seconds_remaining: 1799,
  },
  assessment: { id: ASM, title: "Rivers", instructions: "Read", total_marks: 3, duration_minutes: 30 },
  questions: [
    {
      id: "q1", position: 0, type: "single_choice", text: "Which?", image_url: null, marks: 2,
      options: [{ id: "o1", text: "A" }, { id: "o2", text: "B" }],
    },
    { id: "q2", position: 1, type: "true_false", text: "True?", image_url: null, marks: 1, options: [] },
  ],
  ...over,
});

describe("getAttemptPaperAction", () => {
  it("valid access: returns the mapped paper from one rpc call carrying only the attempt id", async () => {
    state.rpcQueue = [{ data: paperJson() }];
    const r = await getAttemptPaperAction({ attemptId: ATT });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.paper.questions.map((q) => q.id)).toEqual(["q1", "q2"]);
      const first = r.paper.questions[0];
      expect(first && "options" in first ? first.options : []).toHaveLength(2);
      expect(r.paper.attempt.attemptId).toBe(ATT);
    }
    expect(state.rpcCalls).toEqual([{ fn: "get_attempt_paper", args: { p_attempt: ATT } }]);
  });

  it("never trusts a client-supplied student id: extra input fields are not forwarded", async () => {
    state.rpcQueue = [{ data: paperJson() }];
    await getAttemptPaperAction({ attemptId: ATT, userId: "someone-else", user_id: "someone-else", studentId: "x" });
    expect(state.rpcCalls).toHaveLength(1);
    expect(Object.keys(state.rpcCalls[0]?.args ?? {})).toEqual(["p_attempt"]);
    expect(JSON.stringify(state.rpcCalls)).not.toMatch(/someone-else/);
  });

  it("cross-student access: another student's attempt gives the same refusal as a missing attempt, and no content", async () => {
    state.rpcQueue = [{ error: { code: "EA005", message: "Attempt not found." } }];
    const other = await getAttemptPaperAction({ attemptId: ATT });
    state.rpcQueue = [{ error: { code: "EA005", message: "Attempt not found." } }];
    const missing = await getAttemptPaperAction({ attemptId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd" });
    expect(other).toEqual(missing);
    expect(other.ok).toBe(false);
    expect(JSON.stringify(other)).not.toMatch(/question|option/i);
  });

  it.each([
    ["EA001", "This assessment is not available to you."],
    ["EA002", "This assessment has not opened yet."],
    ["EA003", "This assessment is closed."],
    ["EA005", "We could not find that attempt."],
    ["EA007", "This attempt is no longer open."],
    ["42501", "Please sign in with a student account to take an assessment."],
  ])("database refusal %s maps to fixed wording and returns no paper", async (code, message) => {
    state.rpcQueue = [{ error: { code, message: "raw database text that must never be shown" } }];
    const r = await getAttemptPaperAction({ attemptId: ATT });
    expect(r).toEqual({ ok: false, error: message });
  });

  it("an unknown database error gives the generic message, never the raw text", async () => {
    state.rpcQueue = [{ error: { code: "XX000", message: "relation questions secret detail" } }];
    const r = await getAttemptPaperAction({ attemptId: ATT });
    expect(r.ok).toBe(false);
    expect(JSON.stringify(r)).not.toMatch(/relation|secret/);
  });

  it.each([
    ["missing", {}],
    ["not a uuid", { attemptId: "not-a-uuid" }],
    ["a number", { attemptId: 5 }],
    ["an array", { attemptId: [ATT] }],
    ["null input", null],
    ["a string input", "x"],
  ])("invalid attempt id (%s) is rejected before the database is called", async (_n, input) => {
    const r = await getAttemptPaperAction(input);
    expect(r.ok).toBe(false);
    expect(state.rpcCalls).toHaveLength(0);
  });

  it("fails closed on a payload with a leaked key: no paper is returned", async () => {
    const leaked = paperJson();
    (leaked.questions as Record<string, unknown>[])[0] = {
      ...(leaked.questions as Record<string, unknown>[])[0],
      explanation: "The answer is A",
    };
    state.rpcQueue = [{ data: leaked }];
    const r = await getAttemptPaperAction({ attemptId: ATT });
    expect(r).toEqual({ ok: false, error: "Something went wrong. Please try again." });
    expect(JSON.stringify(r)).not.toMatch(/answer is A/);
  });

  it("fails closed on an empty or malformed payload", async () => {
    for (const data of [null, {}, "x", []]) {
      state.rpcQueue = [{ data }];
      const r = await getAttemptPaperAction({ attemptId: ATT });
      expect(r.ok).toBe(false);
    }
  });

  it("refuses a teacher or signed-out caller without calling the database", async () => {
    state.role = "teacher";
    expect((await getAttemptPaperAction({ attemptId: ATT })).ok).toBe(false);
    state.role = "student";
    state.user = null;
    expect((await getAttemptPaperAction({ attemptId: ATT })).ok).toBe(false);
    expect(state.rpcCalls).toHaveLength(0);
  });

  it("only reads the profiles table for the role check, never a question or key table", async () => {
    state.rpcQueue = [{ data: paperJson() }];
    await getAttemptPaperAction({ attemptId: ATT });
    expect(state.fromCalls.every((c) => c.table === "profiles")).toBe(true);
  });
});
