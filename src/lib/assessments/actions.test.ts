import { beforeEach, describe, expect, it, vi } from "vitest";

type Res = { data?: unknown; error?: { code?: string; message?: string } | null; count?: number };
type Call = { table: string; ops: { op: string; args: unknown[] }[] };

const state: {
  user: { id: string } | null;
  role: unknown;
  queue: Record<string, Res[]>;
  calls: Call[];
  owned: Record<string, unknown> | null;
  ownedArgs: unknown[][];
  snapshot: unknown;
} = { user: { id: "teacher-1" }, role: "teacher", queue: {}, calls: [], owned: null, ownedArgs: [], snapshot: null };

vi.mock("@/lib/supabase/env", () => ({ isSupabaseConfigured: () => true }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("./data", () => ({
  fetchOwnedAssessment: async (_s: unknown, id: string, userId: string) => {
    state.ownedArgs.push([id, userId]);
    return state.owned;
  },
  loadSnapshot: async () => state.snapshot,
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from: (table: string) => {
      const call: Call = { table, ops: [] };
      state.calls.push(call);
      const b: Record<string, unknown> = {};
      for (const op of ["select", "insert", "update", "delete", "eq", "order", "limit"]) {
        b[op] = (...args: unknown[]) => {
          call.ops.push({ op, args });
          return b;
        };
      }
      const take = () => {
        if (table === "profiles") return { data: state.role === undefined ? null : { role: state.role }, error: null };
        const r = state.queue[table]?.shift() ?? {};
        return { data: r.data ?? null, error: r.error ?? null, count: r.count };
      };
      b.maybeSingle = async () => take();
      b.single = async () => take();
      b.then = (resolve: (v: unknown) => unknown) => resolve(take());
      return b;
    },
  }),
}));

import { revalidatePath } from "next/cache";
import {
  createAssessmentAction,
  deleteAssessmentAction,
  deleteQuestionAction,
  publishAssessmentAction,
  reorderQuestionsAction,
  saveQuestionAction,
  unpublishAssessmentAction,
  updateAssessmentAction,
} from "./actions";

const AID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const QID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const NO_ACCESS = { ok: false, error: "Please sign in with a teacher account to continue." };
const NOT_FOUND = { ok: false, error: "This assessment was not found, or you do not have access to it." };

const draft = (extra: Record<string, unknown> = {}) => ({ id: AID, status: "draft", totalMarks: 1, closesAt: null, ...extra });
const q = (table: string, ...r: Res[]) => (state.queue[table] = r);
const wrote = (...tables: string[]) =>
  state.calls.some((c) => tables.includes(c.table) && c.ops.some((o) => ["insert", "update", "delete"].includes(o.op)));
const arg = (c: Call, op: string) => c.ops.find((o) => o.op === op)?.args[0];

const createInput = {
  title: "Rivers quiz",
  description: "",
  instructions: "",
  courseId: CID,
  unitId: null,
  durationMinutes: 30,
  attemptLimit: null,
  opensAt: null,
  closesAt: null,
};
const questionInput = {
  assessmentId: AID,
  type: "true_false",
  text: "The Ganga flows east.",
  marks: 2,
  explanation: "",
  options: [],
  correctIndexes: [],
  correctBoolean: true,
  acceptedAnswers: [],
  caseSensitive: false,
};
const settings = { ...createInput, passingMarks: null } as Record<string, unknown>;
delete settings.courseId;

beforeEach(() => {
  state.user = { id: "teacher-1" };
  state.role = "teacher";
  state.queue = {};
  state.calls = [];
  state.owned = draft();
  state.ownedArgs = [];
  state.snapshot = { questions: [], totalMarks: 1 };
  vi.mocked(revalidatePath).mockClear();
});

const everyAction: [string, () => Promise<unknown>][] = [
  ["create", () => createAssessmentAction(createInput)],
  ["update", () => updateAssessmentAction(AID, settings)],
  ["delete", () => deleteAssessmentAction(AID)],
  ["saveQuestion", () => saveQuestionAction(questionInput)],
  ["deleteQuestion", () => deleteQuestionAction(AID, QID)],
  ["reorder", () => reorderQuestionsAction(AID, [])],
  ["publish", () => publishAssessmentAction(AID)],
  ["unpublish", () => unpublishAssessmentAction(AID)],
];

describe("only teachers may use the assessment builder", () => {
  describe.each([
    ["student", "student"],
    ["admin", "admin"],
    ["unknown role", "nonsense"],
    ["no profile row", null],
  ])("%s", (_n, role) => {
    it.each(everyAction)("%s is refused and nothing is written", async (_a, run) => {
      state.role = role;
      expect(await run()).toEqual(NO_ACCESS);
      expect(wrote("assessments", "questions", "question_options", "question_answer_keys", "question_correct_options")).toBe(false);
      expect(state.ownedArgs).toHaveLength(0);
      expect(revalidatePath).not.toHaveBeenCalled();
    });
  });

  it.each(everyAction)("signed-out callers are refused: %s", async (_a, run) => {
    state.user = null;
    expect(await run()).toEqual(NO_ACCESS);
    expect(state.calls).toHaveLength(0);
  });
});

describe("ownership", () => {
  it("looks up the assessment with the session user id", async () => {
    await deleteAssessmentAction(AID);
    expect(state.ownedArgs).toEqual([[AID, "teacher-1"]]);
  });

  it.each([
    ["update", () => updateAssessmentAction(AID, settings)],
    ["delete", () => deleteAssessmentAction(AID)],
    ["saveQuestion", () => saveQuestionAction(questionInput)],
    ["deleteQuestion", () => deleteQuestionAction(AID, QID)],
    ["reorder", () => reorderQuestionsAction(AID, [])],
    ["publish", () => publishAssessmentAction(AID)],
    ["unpublish", () => unpublishAssessmentAction(AID)],
  ])("%s on someone else's assessment looks like 'not found' and writes nothing", async (_a, run) => {
    state.owned = null;
    expect(await run()).toEqual(NOT_FOUND);
    expect(wrote("assessments", "questions", "question_options", "question_answer_keys")).toBe(false);
  });

  it("rejects malformed ids without any database call", async () => {
    expect(await deleteAssessmentAction("nope")).toEqual(NOT_FOUND);
    expect(await deleteQuestionAction(AID, "nope")).toEqual(NOT_FOUND);
    expect(await reorderQuestionsAction(AID, ["nope"])).toEqual(NOT_FOUND);
    expect(await publishAssessmentAction({})).toEqual(NOT_FOUND);
    expect(state.calls).toHaveLength(0);
  });
});

describe("published assessments are locked", () => {
  beforeEach(() => {
    state.owned = draft({ status: "published" });
  });
  it.each([
    ["update", () => updateAssessmentAction(AID, settings)],
    ["delete", () => deleteAssessmentAction(AID)],
    ["saveQuestion", () => saveQuestionAction(questionInput)],
    ["deleteQuestion", () => deleteQuestionAction(AID, QID)],
    ["reorder", () => reorderQuestionsAction(AID, [])],
    ["publish", () => publishAssessmentAction(AID)],
  ])("%s is refused", async (_a, run) => {
    const res = (await run()) as { ok: boolean; error?: string };
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/published and locked/);
    expect(wrote("assessments", "questions", "question_options", "question_answer_keys")).toBe(false);
  });

  it("unpublish moves it back to draft", async () => {
    q("assessments", { data: { id: AID } });
    expect(await unpublishAssessmentAction(AID)).toEqual({ ok: true });
    const c = state.calls.find((x) => x.table === "assessments")!;
    expect(arg(c, "update")).toEqual({ status: "draft" });
  });

  it("unpublishing a draft is a no-op success", async () => {
    state.owned = draft();
    expect(await unpublishAssessmentAction(AID)).toEqual({ ok: true });
    expect(wrote("assessments")).toBe(false);
  });
});

describe("createAssessmentAction", () => {
  it("rejects invalid input before any database call", async () => {
    const res = await createAssessmentAction({ ...createInput, title: "  " });
    expect(res.ok).toBe(false);
    expect(state.calls).toHaveLength(0);
  });

  it("rejects a closing time before the opening time", async () => {
    const res = await createAssessmentAction({ ...createInput, opensAt: "2027-01-02T00:00:00.000Z", closesAt: "2027-01-01T00:00:00.000Z" });
    expect(res.ok).toBe(false);
  });

  it("refuses a course the teacher does not own", async () => {
    q("courses", { data: null });
    const res = await createAssessmentAction(createInput);
    expect(res).toMatchObject({ ok: false, error: "Choose one of your own courses." });
    expect(wrote("assessments")).toBe(false);
    const course = state.calls.find((c) => c.table === "courses")!;
    expect(course.ops.filter((o) => o.op === "eq").map((o) => o.args)).toEqual([["id", CID], ["created_by", "teacher-1"]]);
  });

  it("creates a draft owned by the session user, ignoring forged owner or status", async () => {
    q("courses", { data: { id: CID } });
    q("assessments", { data: { id: AID } });
    const res = await createAssessmentAction({ ...createInput, created_by: "attacker", createdBy: "attacker", status: "published" });
    expect(res).toEqual({ ok: true, id: AID });
    const row = arg(state.calls.find((c) => c.table === "assessments")!, "insert") as Record<string, unknown>;
    expect(row).toMatchObject({ created_by: "teacher-1", status: "draft", total_marks: 1, course_id: CID });
    expect(revalidatePath).toHaveBeenCalled();
  });

  it("does not show raw database errors", async () => {
    q("courses", { data: { id: CID } });
    q("assessments", { error: { code: "23514", message: 'violates check constraint "x"' } });
    const res = await createAssessmentAction(createInput);
    expect(res).toEqual({ ok: false, error: "Something went wrong while saving. Please try again." });
  });
});

describe("updateAssessmentAction", () => {
  it("requires questions before passing marks", async () => {
    q("questions", { count: 0 });
    const res = await updateAssessmentAction(AID, { ...settings, passingMarks: 1 });
    expect(res).toMatchObject({ ok: false, fieldErrors: { passingMarks: "Add questions before setting passing marks." } });
    expect(wrote("assessments")).toBe(false);
  });

  it("rejects passing marks above the total", async () => {
    state.owned = draft({ totalMarks: 10 });
    q("questions", { count: 3 });
    const res = await updateAssessmentAction(AID, { ...settings, passingMarks: 11 });
    expect(res.ok).toBe(false);
    expect(wrote("assessments")).toBe(false);
  });

  it("saves settings only while the row is still a draft", async () => {
    q("assessments", { data: { updated_at: "2026-10-18T00:00:00Z" } });
    const res = await updateAssessmentAction(AID, { ...settings, status: "published", course_id: CID, created_by: "x" });
    expect(res).toEqual({ ok: true, updatedAt: "2026-10-18T00:00:00Z" });
    const c = state.calls.find((x) => x.table === "assessments")!;
    const patch = arg(c, "update") as Record<string, unknown>;
    expect(Object.keys(patch)).not.toContain("status");
    expect(Object.keys(patch)).not.toContain("course_id");
    expect(Object.keys(patch)).not.toContain("created_by");
    expect(c.ops.filter((o) => o.op === "eq").map((o) => o.args)).toContainEqual(["status", "draft"]);
  });
});

describe("deleteAssessmentAction", () => {
  it("deletes only drafts", async () => {
    q("assessments", { data: [{ id: AID }] });
    expect(await deleteAssessmentAction(AID)).toEqual({ ok: true });
    const c = state.calls.find((x) => x.table === "assessments")!;
    expect(c.ops.filter((o) => o.op === "eq").map((o) => o.args)).toContainEqual(["status", "draft"]);
  });

  it("reports not found when nothing was deleted", async () => {
    q("assessments", { data: [] });
    expect(await deleteAssessmentAction(AID)).toEqual(NOT_FOUND);
  });
});

describe("saveQuestionAction", () => {
  it("validates before touching the database", async () => {
    const res = await saveQuestionAction({ ...questionInput, text: "" });
    expect(res.ok).toBe(false);
    expect(state.calls).toHaveLength(0);
  });

  it("will not change an existing question's type", async () => {
    q("questions", { data: { id: QID, question_type: "single_choice" } });
    const res = await saveQuestionAction({ ...questionInput, id: QID });
    expect(res).toMatchObject({ ok: false, error: expect.stringMatching(/type cannot be changed/) });
    expect(wrote("questions")).toBe(false);
  });

  it("creates a true/false question at the next position, scoped to the assessment", async () => {
    q("questions", { data: [{ position: 4 }] }, { data: { id: QID } }, { data: [{ marks: 2 }] });
    q("assessments", { data: { passing_marks: null } }, {});
    q("question_answer_keys", {});
    const res = await saveQuestionAction(questionInput);
    expect(res).toMatchObject({ ok: true, questionId: QID });
    const ins = state.calls.find((c) => c.table === "questions" && c.ops.some((o) => o.op === "insert"))!;
    expect(arg(ins, "insert")).toMatchObject({ assessment_id: AID, question_type: "true_false", marks: 2, position: 5 });
    const key = state.calls.find((c) => c.table === "question_answer_keys")!;
    expect(arg(key, "insert")).toMatchObject({ question_id: QID, correct_boolean: true });
  });

  it("removes a half-created question when its answer data fails", async () => {
    q("questions", { data: [] }, { data: { id: QID } }, {});
    q("question_answer_keys", { error: { code: "XX000", message: "boom" } });
    const res = await saveQuestionAction(questionInput);
    expect(res.ok).toBe(false);
    const del = state.calls.find((c) => c.table === "questions" && c.ops.some((o) => o.op === "delete"));
    expect(del).toBeTruthy();
  });
});

describe("reorderQuestionsAction", () => {
  it("refuses a list that does not match the stored questions", async () => {
    q("questions", { data: [{ id: QID }] });
    const res = await reorderQuestionsAction(AID, [AID]);
    expect(res).toMatchObject({ ok: false, error: expect.stringMatching(/list changed/) });
    expect(wrote("questions")).toBe(false);
  });
});

describe("publishAssessmentAction", () => {
  it("lists issues and does not publish an assessment with no questions", async () => {
    const res = await publishAssessmentAction(AID);
    expect(res).toMatchObject({ ok: false, issues: ["Add at least one question before publishing."] });
    expect(wrote("assessments")).toBe(false);
  });

  it("blocks when the closing time has already passed", async () => {
    state.owned = draft({ closesAt: "2020-01-01T00:00:00.000Z" });
    state.snapshot = { questions: [{ type: "true_false", marks: 1, options: [], correctBoolean: true, acceptedAnswers: [] }], totalMarks: 1 };
    const res = (await publishAssessmentAction(AID)) as { ok: boolean; issues?: string[] };
    expect(res.ok).toBe(false);
    expect(res.issues?.join(" ")).toMatch(/closing time has already passed/);
    expect(wrote("assessments")).toBe(false);
  });

  it("publishes a ready draft, only from the draft state", async () => {
    state.snapshot = { questions: [{ type: "true_false", marks: 1, options: [], correctBoolean: true, acceptedAnswers: [] }], totalMarks: 1 };
    q("assessments", { data: { id: AID } });
    expect(await publishAssessmentAction(AID)).toEqual({ ok: true });
    const c = state.calls.find((x) => x.table === "assessments")!;
    expect(arg(c, "update")).toEqual({ status: "published" });
    expect(c.ops.filter((o) => o.op === "eq").map((o) => o.args)).toContainEqual(["status", "draft"]);
  });

  it("shows the database's plain-language refusal", async () => {
    state.snapshot = { questions: [{ type: "true_false", marks: 1, options: [], correctBoolean: true, acceptedAnswers: [] }], totalMarks: 1 };
    q("assessments", { error: { code: "23514", message: "Add at least one question before publishing." } });
    const res = await publishAssessmentAction(AID);
    expect(res).toEqual({ ok: false, error: "Add at least one question before publishing." });
  });
});
