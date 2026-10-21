import { beforeEach, describe, expect, it, vi } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Phase C5: verification of question delivery (checklist items 1-8 and 10).
 *
 * Two kinds of test live here, and neither touches a real Supabase project:
 *  - MOCKED: the real server actions + the real view logic run against a fake Supabase client whose rpc
 *    can return errors or throw. They prove what the TypeScript layer does with whatever the database says.
 *  - STATIC: the migration SQL is read as text to check that the database side and the server side agree
 *    (which policies exist after all migrations, who may execute the function, what the function selects).
 *    A static read is NOT a database run. The SQL itself is exercised only by supabase/tests/*.sql on a
 *    real Postgres, which this file does not replace.
 */

type RpcRes = { data?: unknown; error?: { code?: string; message?: string } | null; throws?: boolean };

const state: {
  user: { id: string } | null;
  role: unknown;
  rpcQueue: RpcRes[];
  rpcCalls: { fn: string; args: Record<string, unknown> }[];
  tables: string[];
} = { user: { id: "student-1" }, role: "student", rpcQueue: [], rpcCalls: [], tables: [] };

vi.mock("@/lib/supabase/env", () => ({ isSupabaseConfigured: () => true }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from: (table: string) => {
      state.tables.push(table);
      const b: Record<string, unknown> = {};
      b.select = () => b;
      b.eq = () => b;
      b.maybeSingle = async () => ({ data: state.role === undefined ? null : { role: state.role }, error: null });
      return b;
    },
    rpc: async (fn: string, args: Record<string, unknown>) => {
      state.rpcCalls.push({ fn, args });
      const r = state.rpcQueue.shift() ?? {};
      if (r.throws) throw new Error('connection to "db.internal.example" failed: relation "question_answer_keys" does not exist');
      return { data: r.data ?? null, error: r.error ?? null };
    },
  }),
}));

import { getAttemptPaperAction, getOpenAttemptAction } from "./attempt-actions";
import { attemptErrorMessage, ATTEMPT_GENERIC_ERROR } from "./attempts";
import { loadPaperView } from "./paper-view";

const ASM = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_ASM = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const ATT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const attemptRow = (over: Record<string, unknown> = {}) => ({
  attempt_id: ATT,
  assessment_id: ASM,
  attempt_number: 1,
  status: "in_progress",
  started_at: "2026-10-19T10:00:00+00:00",
  expires_at: "2026-10-19T10:30:00+00:00",
  submitted_at: null,
  server_now: "2026-10-19T10:00:01+00:00",
  seconds_remaining: 1799,
  resumed: true,
  ...over,
});

const paperPayload = (over: { assessment_id?: string; questions?: unknown[] } = {}) => {
  const { resumed: _r, submitted_at: _s, ...a } = attemptRow();
  void _r;
  void _s;
  return {
    attempt: { ...a, assessment_id: over.assessment_id ?? ASM },
    assessment: { id: over.assessment_id ?? ASM, title: "T", instructions: "", total_marks: 3, duration_minutes: 30 },
    questions: over.questions ?? [
      {
        id: "q1", position: 0, type: "single_choice", text: "Which?", image_url: null, marks: 1,
        options: [{ id: "o1", text: "A" }, { id: "o2", text: "B" }],
      },
      { id: "q2", position: 1, type: "true_false", text: "True?", image_url: null, marks: 1, options: [] },
      { id: "q3", position: 2, type: "short_answer", text: "Name it", image_url: null, marks: 1, options: [] },
    ],
  };
};

const deps = { getOpenAttempt: getOpenAttemptAction, getPaper: getAttemptPaperAction };

beforeEach(() => {
  state.user = { id: "student-1" };
  state.role = "student";
  state.rpcQueue = [];
  state.rpcCalls = [];
  state.tables = [];
});

describe("C5 items 1-3: access refusals reach the view as fixed text and no content", () => {
  it("signed-out: the view is an error, no rpc is made", async () => {
    state.user = null;
    const v = await loadPaperView(deps, ASM);
    expect(v.kind).toBe("error");
    expect(state.rpcCalls).toHaveLength(0);
  });

  it.each(["teacher", "admin", null, undefined])("role %s cannot reach the paper", async (role) => {
    state.role = role;
    const v = await loadPaperView(deps, ASM);
    expect(v.kind).toBe("error");
    expect(state.rpcCalls).toHaveLength(0);
  });

  it.each(["not-a-uuid", "", "1; drop table questions", "../../etc/passwd"])("a malformed attempt id %s never reaches the database", async (id) => {
    const r = await getAttemptPaperAction({ attemptId: id });
    expect(r.ok).toBe(false);
    expect(state.rpcCalls).toHaveLength(0);
  });

  it("another student's attempt (database says EA005) shows the same text as a missing one, and no paper", async () => {
    state.rpcQueue = [{ error: { code: "EA005", message: "Attempt not found." } }];
    const r = await getAttemptPaperAction({ attemptId: ATT });
    expect(r).toEqual({ ok: false, error: "We could not find that attempt." });
  });
});

describe("C5 item 4: draft, unavailable, closed and submitted map to fixed refusals", () => {
  it.each([
    ["EA001", "This assessment is not available to you."],
    ["EA002", "This assessment has not opened yet."],
    ["EA003", "This assessment is closed."],
    ["EA007", "This attempt is no longer open."],
  ])("database code %s gives a fixed message and no questions", async (code, text) => {
    state.rpcQueue = [{ data: paperPayload(), error: { code, message: "ignored" } }];
    const r = await getAttemptPaperAction({ attemptId: ATT });
    expect(r).toEqual({ ok: false, error: text });
  });

  it("an error response never lets a data payload through, even if one is attached", async () => {
    state.rpcQueue = [{ data: paperPayload(), error: { code: "EA001" } }];
    const r = await getAttemptPaperAction({ attemptId: ATT });
    expect(JSON.stringify(r)).not.toMatch(/Which\?|questions/);
  });
});

describe("C5 item 5: only the authorised assessment's questions", () => {
  it("accepts a paper for the asked assessment", async () => {
    state.rpcQueue = [{ data: [attemptRow()] }, { data: paperPayload() }];
    const v = await loadPaperView(deps, ASM);
    expect(v.kind).toBe("ready");
    if (v.kind === "ready") expect(v.paper.questions.map((q) => q.id)).toEqual(["q1", "q2", "q3"]);
  });

  it("rejects a paper that belongs to a different assessment", async () => {
    state.rpcQueue = [{ data: [attemptRow()] }, { data: paperPayload({ assessment_id: OTHER_ASM }) }];
    const v = await loadPaperView(deps, ASM);
    expect(v.kind).toBe("error");
  });

  it("rejects a paper with a duplicated question (a question from another set repeated)", async () => {
    const dup = paperPayload().questions[0];
    state.rpcQueue = [{ data: [attemptRow()] }, { data: paperPayload({ questions: [dup, dup] }) }];
    const v = await loadPaperView(deps, ASM);
    expect(v.kind).toBe("error");
  });

  it("asks for the paper of the attempt the server returned, with only that id", async () => {
    state.rpcQueue = [{ data: [attemptRow()] }, { data: paperPayload() }];
    await loadPaperView(deps, ASM);
    expect(state.rpcCalls.map((c) => c.fn)).toEqual(["get_my_open_attempt", "get_attempt_paper"]);
    expect(state.rpcCalls[1]?.args).toEqual({ p_attempt: ATT });
  });
});

describe("C5 items 6-7: leaks fail closed at the view", () => {
  const leaks: [string, Record<string, unknown>][] = [
    ["question is_correct", { is_correct: true }],
    ["question correct_option_ids", { correct_option_ids: ["o1"] }],
    ["question correct_boolean", { correct_boolean: true }],
    ["question accepted_answers", { accepted_answers: ["x"] }],
    ["question explanation", { explanation: "because" }],
    ["question rubric", { rubric: "r" }],
    ["question score", { score: 1 }],
  ];
  it.each(leaks)("%s makes the whole view an error with no question text", async (_n, extra) => {
    const p = paperPayload();
    p.questions = [{ ...(p.questions[0] as object), ...extra }, ...p.questions.slice(1)];
    state.rpcQueue = [{ data: [attemptRow()] }, { data: p }];
    const v = await loadPaperView(deps, ASM);
    expect(v.kind).toBe("error");
    expect(JSON.stringify(v)).not.toMatch(/Which\?/);
  });

  it("a leaked flag inside a nested option fails the whole paper", async () => {
    const p = paperPayload();
    p.questions = [
      { ...(p.questions[0] as object), options: [{ id: "o1", text: "A", is_correct: true }, { id: "o2", text: "B" }] },
      ...p.questions.slice(1),
    ];
    state.rpcQueue = [{ data: [attemptRow()] }, { data: p }];
    expect((await loadPaperView(deps, ASM)).kind).toBe("error");
  });

  it("options smuggled onto a true/false question fail the whole paper", async () => {
    const p = paperPayload();
    p.questions = [p.questions[0], { ...(p.questions[1] as object), options: [{ id: "x", text: "True" }] }, p.questions[2]];
    state.rpcQueue = [{ data: [attemptRow()] }, { data: p }];
    expect((await loadPaperView(deps, ASM)).kind).toBe("error");
  });

  it("a ready view serialises with no restricted key name anywhere", async () => {
    state.rpcQueue = [{ data: [attemptRow()] }, { data: paperPayload() }];
    const v = await loadPaperView(deps, ASM);
    expect(JSON.stringify(v)).not.toMatch(/correct|accepted|explanation|rubric|case_?sensitive|expected/i);
  });
});

describe("C5 item 8: retrieval failures reveal nothing about the database", () => {
  const hostile = [
    { code: "42P01", message: 'relation "public.question_answer_keys" does not exist' },
    { code: "XX000", message: "connection to server at 10.0.0.5, port 5432 failed" },
    { code: "PGRST301", message: "JWT expired" },
    { code: "23505", message: 'duplicate key value violates unique constraint "questions_pkey"' },
    { code: undefined, message: "permission denied for table question_correct_options" },
  ];

  it.each(hostile)("rpc error %j gives only the generic message", async (error) => {
    state.rpcQueue = [{ error }];
    const r = await getAttemptPaperAction({ attemptId: ATT });
    expect(r).toEqual({ ok: false, error: ATTEMPT_GENERIC_ERROR });
  });

  it("a thrown error (network / driver) never reaches the view text", async () => {
    state.rpcQueue = [{ data: [attemptRow()] }, { throws: true }];
    const v = await loadPaperView(deps, ASM);
    expect(v).toEqual({ kind: "error", message: ATTEMPT_GENERIC_ERROR });
    expect(JSON.stringify(v)).not.toMatch(/db\.internal|question_answer_keys|relation/);
  });

  it("a thrown error on the open-attempt lookup is generic too", async () => {
    state.rpcQueue = [{ throws: true }];
    const v = await loadPaperView(deps, ASM);
    expect(v).toEqual({ kind: "error", message: ATTEMPT_GENERIC_ERROR });
  });
});

// ---------------------------------------------------------------------------------------------
// STATIC agreement checks (SQL read as text; not a database run)
// ---------------------------------------------------------------------------------------------

const MIG_DIR = join(process.cwd(), "supabase", "migrations");
const migrations = readdirSync(MIG_DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => ({ f, sql: readFileSync(join(MIG_DIR, f), "utf8") }));
const allSql = migrations.map((m) => m.sql).join("\n");
const stripSql = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--.*$/gm, "");

/** Policies that exist on a table after every migration ran in file order (create minus drop). */
function effectivePolicies(table: string): { name: string; text: string }[] {
  const live = new Map<string, string>();
  for (const { sql } of migrations) {
    const s = stripSql(sql);
    for (const m of s.matchAll(/create\s+policy\s+"([^"]+)"\s+on\s+public\.(\w+)([^;]*);/gi)) {
      if (m[2] === table) live.set(m[1] as string, m[3] as string);
    }
    for (const m of s.matchAll(/drop\s+policy\s+(?:if\s+exists\s+)?"([^"]+)"\s+on\s+public\.(\w+)/gi)) {
      if (m[2] === table) live.delete(m[1] as string);
    }
  }
  return [...live].map(([name, text]) => ({ name, text }));
}

const STUDENT_HELPERS = /is_enrolled_in_assessment|is_assessment_open|is_question_open|auth\.uid\(\)/i;
const staffOnly = (text: string) => /is_teacher_or_admin\(\)|is_admin\(\)/i.test(text);

function functionBody(name: string): string {
  const start = allSql.search(new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${name}\\b`, "i"));
  expect(start).toBeGreaterThan(-1);
  const rest = allSql.slice(start);
  const open = rest.indexOf("$$");
  const close = rest.indexOf("$$", open + 2);
  return stripSql(rest.slice(0, close + 2));
}

describe("C5 item 10: database policies and server-side authorisation agree (static)", () => {
  it.each(["questions", "question_options", "question_answer_keys", "question_correct_options"])(
    "after all migrations, every remaining policy on %s is staff-only (no student path)",
    (table) => {
      const policies = effectivePolicies(table);
      expect(policies.length).toBeGreaterThan(0);
      for (const p of policies) {
        expect(`${table}: ${p.name}: ${staffOnly(p.text)}`).toMatch(/: true$/);
        expect(`${p.name}: ${STUDENT_HELPERS.test(p.text.replace(/is_teacher_or_admin\(\)|is_admin\(\)/gi, ""))}`).toMatch(/: false$/);
      }
    },
  );

  it("no later migration re-creates a student read policy on the question tables", () => {
    const later = migrations.filter((m) => m.f > "20261017000001_phase3_assessments.sql").map((m) => stripSql(m.sql)).join("\n");
    expect(later).not.toMatch(/create\s+policy[^;]*on\s+public\.(questions|question_options|question_answer_keys|question_correct_options)[^;]*to\s+(authenticated|anon|public)[^;]*(is_assessment_open|is_question_open|is_enrolled_in_assessment)/i);
  });

  it("no migration grants anon anything on the question or key tables", () => {
    const s = stripSql(allSql);
    expect(s).not.toMatch(/grant[^;]*on\s+public\.(questions|question_options|question_answer_keys|question_correct_options)[^;]*\bto\s+[^;]*\banon\b/i);
  });

  it("get_attempt_paper takes the caller from auth.uid() and has no user-id parameter", () => {
    const body = functionBody("get_attempt_paper");
    expect(body).toMatch(/get_attempt_paper\(p_attempt uuid\)/i);
    expect(body).toMatch(/auth\.uid\(\)/);
    expect(body).toMatch(/current_user_role\(\)[^;]*'student'/i);
    expect(body).toMatch(/t\.user_id\s*=\s*v_uid/);
    expect(body).toMatch(/security\s+definer/i);
    expect(body).toMatch(/set\s+search_path\s*=\s*''/i);
  });

  it("get_attempt_paper re-checks enrolment, publication, window and effective status", () => {
    const body = functionBody("get_attempt_paper");
    expect(body).toMatch(/is_enrolled_in_assessment\(/);
    expect(body).toMatch(/is_assessment_open\(/);
    expect(body).toMatch(/opens_at/);
    expect(body).toMatch(/closes_at/);
    expect(body).toMatch(/expire_overdue_attempts\(/);
    expect(body).toMatch(/status\s*<>\s*'in_progress'/);
  });

  it("get_attempt_paper scopes questions to the attempt's own assessment and never reads key tables", () => {
    const body = functionBody("get_attempt_paper");
    expect(body).toMatch(/where\s+q\.assessment_id\s*=\s*v_row\.assessment_id/i);
    expect(body).toMatch(/where\s+o\.question_id\s*=\s*q\.id/i);
    expect(body).not.toMatch(/question_answer_keys|question_correct_options|correct_boolean|accepted_answers|explanation|case_sensitive/i);
    expect(body).not.toMatch(/to_jsonb|row_to_json|to_json\(|\bq\.\*|\bo\.\*/i);
  });

  it("the question and option payload is an explicit field list (jsonb_build_object)", () => {
    const body = functionBody("get_attempt_paper");
    const q = body.match(/jsonb_build_object\(\s*'id',\s*q\.id[\s\S]*?\)\s*order by q\.position/i);
    expect(q).not.toBeNull();
    const keys = [...(q?.[0] ?? "").matchAll(/'(\w+)',\s*(?:q|o|case|coalesce)/g)].map((m) => m[1]);
    // Seven question keys, then the nested option object's two keys (id, text) matched by the same scan.
    expect(keys).toEqual(["id", "position", "type", "text", "image_url", "marks", "options", "id", "text"]);
    expect(body).toMatch(/jsonb_build_object\('id', o\.id, 'text', o\.option_text\)/);
  });

  it("get_attempt_paper and get_assessment_question_count are not executable by anon or public", () => {
    // Scoped to the migration that creates the functions: other migrations contain the same revoke line.
    const c2 = migrations.find((m) => m.f.includes("phase_c2_question_delivery"));
    expect(c2).toBeTruthy();
    const s = stripSql(c2?.sql ?? "");
    expect(s).toMatch(/revoke all on function public\.%s from public, anon/);
    expect(s).toMatch(/array\['get_attempt_paper\(uuid\)', 'get_assessment_question_count\(uuid\)'\]/);
    expect(s).toMatch(/grant execute on function public\.%s to authenticated/);
  });

  it("every error code the function raises has its own fixed student message", () => {
    const codes = [...new Set([...functionBody("get_attempt_paper").matchAll(/errcode\s*=\s*'(\w+)'/g)].map((m) => m[1] as string))];
    expect(codes.sort()).toEqual(["42501", "EA001", "EA002", "EA003", "EA005", "EA007"]);
    const messages = codes.map((c) => attemptErrorMessage({ code: c }));
    for (const m of messages) expect(m).not.toBe(ATTEMPT_GENERIC_ERROR);
    expect(new Set(messages).size).toBe(codes.length);
  });

  it("the server never reads a question or key table for students (only profiles, for the role)", async () => {
    state.rpcQueue = [{ data: [attemptRow()] }, { data: paperPayload() }];
    await loadPaperView(deps, ASM);
    expect([...new Set(state.tables)]).toEqual(["profiles"]);
  });
});
