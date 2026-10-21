import { beforeEach, describe, expect, it, vi } from "vitest";

type DbError = { code?: string; message?: string } | null;

const state: {
  user: { id: string } | null;
  authError: DbError;
  role: unknown;
  profileError: DbError;
  rpcError: DbError;
  rpcCalls: { fn: string; args: Record<string, unknown> }[];
  profileCalls: { table: string; selected: string[]; filters: [string, unknown][] }[];
  clientCalls: number;
} = {
  user: { id: "teacher-1" },
  authError: null,
  role: "teacher",
  profileError: null,
  rpcError: null,
  rpcCalls: [],
  profileCalls: [],
  clientCalls: 0,
};

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => {
    state.clientCalls += 1;
    return {
      auth: { getUser: async () => ({ data: { user: state.user }, error: state.authError }) },
      from: (table: string) => {
        const call = { table, selected: [] as string[], filters: [] as [string, unknown][] };
        state.profileCalls.push(call);
        const builder = {
          select: (columns: string) => { call.selected.push(columns); return builder; },
          eq: (column: string, value: unknown) => { call.filters.push([column, value]); return builder; },
          maybeSingle: async () => ({
            data: state.role === undefined ? null : { role: state.role },
            error: state.profileError,
          }),
        };
        return builder;
      },
      rpc: async (fn: string, args: Record<string, unknown>) => {
        state.rpcCalls.push({ fn, args });
        return { data: null, error: state.rpcError };
      },
    };
  },
}));

import { revalidatePath } from "next/cache";
import { gradeAttemptAnswerAction } from "./actions";

const ATTEMPT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const QUESTION = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const validInput = { attemptId: ATTEMPT, questionId: QUESTION, marks: 2, feedback: "  Clear explanation.  " };

beforeEach(() => {
  state.user = { id: "teacher-1" };
  state.authError = null;
  state.role = "teacher";
  state.profileError = null;
  state.rpcError = null;
  state.rpcCalls = [];
  state.profileCalls = [];
  state.clientCalls = 0;
  vi.mocked(revalidatePath).mockClear();
});

describe("gradeAttemptAnswerAction input validation", () => {
  it.each([
    null,
    {},
    { ...validInput, attemptId: "not-a-uuid" },
    { ...validInput, questionId: "not-a-uuid" },
    { ...validInput, marks: -0.01 },
    { ...validInput, marks: 100001 },
    { ...validInput, marks: Number.NaN },
    { ...validInput, marks: Number.POSITIVE_INFINITY },
    { ...validInput, feedback: "f".repeat(5001) },
  ])("rejects invalid input before creating a Supabase client: %j", async (input) => {
    expect(await gradeAttemptAnswerAction(input)).toEqual({ ok: false, error: "Please enter valid marks and feedback." });
    expect(state.clientCalls).toBe(0);
    expect(state.rpcCalls).toHaveLength(0);
  });

  it("accepts zero and the upper input boundary; the database enforces each question's actual maximum", async () => {
    expect(await gradeAttemptAnswerAction({ ...validInput, marks: 0 })).toEqual({ ok: true });
    expect(await gradeAttemptAnswerAction({ ...validInput, marks: 100000 })).toEqual({ ok: true });
    expect(state.rpcCalls.map((call) => call.args.p_marks)).toEqual([0, 100000]);
  });
});

describe("gradeAttemptAnswerAction access control", () => {
  it("requires an authenticated session", async () => {
    state.user = null;
    expect(await gradeAttemptAnswerAction(validInput)).toEqual({ ok: false, error: "Please sign in again." });
    expect(state.rpcCalls).toHaveLength(0);
  });

  it("rejects an authentication error even when a user object is returned", async () => {
    state.authError = { message: "internal token detail" };
    expect(await gradeAttemptAnswerAction(validInput)).toEqual({ ok: false, error: "Please sign in again." });
    expect(state.rpcCalls).toHaveLength(0);
  });

  it.each(["student", "unknown", undefined, null])("refuses role %s before grading", async (role) => {
    state.role = role;
    expect(await gradeAttemptAnswerAction(validInput)).toEqual({
      ok: false,
      error: "Only an authorized teacher or administrator can grade answers.",
    });
    expect(state.rpcCalls).toHaveLength(0);
  });

  it("refuses a role lookup error", async () => {
    state.profileError = { code: "XX000", message: "internal role lookup detail" };
    expect(await gradeAttemptAnswerAction(validInput)).toEqual({
      ok: false,
      error: "Only an authorized teacher or administrator can grade answers.",
    });
    expect(state.rpcCalls).toHaveLength(0);
  });
});

describe("gradeAttemptAnswerAction database contract", () => {
  it.each(["teacher", "admin"])("allows %s to call only the grading RPC", async (role) => {
    state.role = role;
    expect(await gradeAttemptAnswerAction(validInput)).toEqual({ ok: true });
    expect(state.profileCalls).toHaveLength(1);
    expect(state.profileCalls[0]).toMatchObject({ table: "profiles", selected: ["role"], filters: [["id", `teacher-1`]] });
    expect(state.rpcCalls).toEqual([{
      fn: "grade_attempt_answer",
      args: { p_attempt: ATTEMPT, p_question: QUESTION, p_marks: 2, p_feedback: "Clear explanation." },
    }]);
    expect(revalidatePath).toHaveBeenCalledTimes(2);
    expect(revalidatePath).toHaveBeenNthCalledWith(1, "/dashboard/teacher/grading");
    expect(revalidatePath).toHaveBeenNthCalledWith(2, "/dashboard/student/results");
  });

  it("normalises blank feedback to null", async () => {
    await gradeAttemptAnswerAction({ ...validInput, feedback: " \n  " });
    expect(state.rpcCalls[0]?.args.p_feedback).toBeNull();
  });

  it("maps permission failures to a fixed message", async () => {
    state.rpcError = { code: "42501", message: "internal ownership data" };
    expect(await gradeAttemptAnswerAction(validInput)).toEqual({
      ok: false,
      error: "You do not have permission to grade this submission.",
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("returns database validation messages for an invalid grade and never revalidates", async () => {
    state.rpcError = { code: "23514", message: "Marks must be between 0 and 3" };
    expect(await gradeAttemptAnswerAction(validInput)).toEqual({ ok: false, error: "Marks must be between 0 and 3" });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("hides unexpected database details behind a stable fallback", async () => {
    state.rpcError = { code: "XX000", message: "relation private_schema.secret missing" };
    const result = await gradeAttemptAnswerAction(validInput);
    expect(result).toEqual({
      ok: false,
      error: "Could not save the grade. Check that the Phase F1 migration is installed, then try again.",
    });
    expect(JSON.stringify(result)).not.toMatch(/private_schema|secret|XX000/);
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
