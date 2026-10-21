import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { answerInstruction, loadPaperView, marksLabel, optionLabel, type PaperDeps } from "./paper-view";
import { mapAttemptPaper, type AttemptPaper } from "./paper";
import { findRestrictedKeys } from "./student-question";
import { ATTEMPT_GENERIC_ERROR, type AttemptInfo } from "./attempts";

/*
 * MOCKED verification of the Phase C4 integration. The two server actions are replaced by in-memory fakes, so
 * these tests prove the page's decision flow and that nothing restricted reaches the view. They do NOT prove
 * the database, RLS, PostgREST or a rendered browser page (see BUILD_STATUS.md, Phase C4).
 */

const ASM = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ATT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const attemptInfo = (over: Partial<AttemptInfo> = {}): AttemptInfo => ({
  attemptId: ATT, assessmentId: ASM, attemptNumber: 1, status: "in_progress", startedAt: "2026-10-19T10:00:00+00:00",
  expiresAt: null, submittedAt: null, serverNow: "2026-10-19T10:00:01+00:00", secondsRemaining: null, resumed: true, ...over,
});

const wireQ = (type: string, i: number, over: Record<string, unknown> = {}) => ({
  id: `q${i}`, position: i, type, text: `Question ${i}`, image_url: null, marks: 1,
  options: type === "single_choice" || type === "multiple_select" ? [{ id: `o${i}a`, text: "A" }, { id: `o${i}b`, text: "B" }] : [],
  ...over,
});
const TYPES = ["single_choice", "multiple_select", "true_false", "short_answer", "descriptive"];
const wirePaper = (questions: unknown[], over: Record<string, unknown> = {}) => ({
  attempt: {
    attempt_id: ATT, assessment_id: ASM, attempt_number: 1, status: "in_progress", started_at: "2026-10-19T10:00:00+00:00",
    expires_at: null, server_now: "2026-10-19T10:00:01+00:00", seconds_remaining: null,
  },
  assessment: { id: ASM, title: "Rivers", instructions: "Read", total_marks: 5, duration_minutes: null },
  questions, ...over,
});

/** Fakes that go through the REAL Phase C3 mapper, like the real server action does. */
function deps(opts: {
  open?: Awaited<ReturnType<PaperDeps["getOpenAttempt"]>> | (() => never);
  raw?: unknown | (() => unknown);
  paperError?: string;
} = {}) {
  const calls = { open: [] as unknown[], paper: [] as unknown[] };
  const d: PaperDeps = {
    getOpenAttempt: async (i) => {
      calls.open.push(i);
      if (typeof opts.open === "function") return opts.open();
      return opts.open ?? { ok: true, attempt: attemptInfo() };
    },
    getPaper: async (i) => {
      calls.paper.push(i);
      if (opts.paperError) return { ok: false, error: opts.paperError };
      const raw = typeof opts.raw === "function" ? (opts.raw as () => unknown)() : opts.raw;
      const paper = mapAttemptPaper(raw);
      return paper ? { ok: true, paper } : { ok: false, error: ATTEMPT_GENERIC_ERROR };
    },
  };
  return { d, calls };
}

describe("access order: the paper is requested only after the server confirms an open attempt", () => {
  it("no open attempt -> view is 'none' and the paper is never requested", async () => {
    const { d, calls } = deps({ open: { ok: true, attempt: null }, raw: wirePaper([wireQ("descriptive", 0)]) });
    expect(await loadPaperView(d, ASM)).toEqual({ kind: "none" });
    expect(calls.paper).toHaveLength(0);
  });

  it("attempt lookup fails -> error view, paper never requested", async () => {
    const { d, calls } = deps({ open: { ok: false, error: "Please sign in with a student account to take an assessment." } });
    const v = await loadPaperView(d, ASM);
    expect(v).toEqual({ kind: "error", message: "Please sign in with a student account to take an assessment." });
    expect(calls.paper).toHaveLength(0);
  });

  it("asks for the open attempt of this assessment, then for exactly that attempt id and nothing else (no user id)", async () => {
    const { d, calls } = deps({ raw: wirePaper([wireQ("descriptive", 0)]) });
    await loadPaperView(d, ASM);
    expect(calls.open).toEqual([{ assessmentId: ASM }]);
    expect(calls.paper).toEqual([{ attemptId: ATT }]);
  });

  it("rejects a paper that belongs to another attempt or another assessment", async () => {
    const other = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    const a = deps({ raw: wirePaper([wireQ("descriptive", 0)], { attempt: { ...wirePaper([]).attempt, attempt_id: other } }) });
    expect((await loadPaperView(a.d, ASM)).kind).toBe("error");
    const b = deps({ raw: wirePaper([wireQ("descriptive", 0)]), open: { ok: true, attempt: attemptInfo({ assessmentId: other }) } });
    expect((await loadPaperView(b.d, other)).kind).toBe("error");
  });
});

describe("display: question text, options, marks, types and order are preserved", () => {
  it("returns all five types in the teacher's order with text, marks and options", async () => {
    const { d } = deps({ raw: wirePaper(TYPES.map((t, i) => wireQ(t, i, { marks: i + 1, text: `Text ${t}` }))) });
    const v = await loadPaperView(d, ASM);
    expect(v.kind).toBe("ready");
    if (v.kind !== "ready") return;
    expect(v.paper.questions.map((q) => q.type)).toEqual(TYPES);
    expect(v.paper.questions.map((q) => q.position)).toEqual([0, 1, 2, 3, 4]);
    expect(v.paper.questions.map((q) => q.marks)).toEqual([1, 2, 3, 4, 5]);
    expect(v.paper.questions[2]?.text).toBe("Text true_false");
    expect((v.paper.questions[0] as { options: { text: string }[] }).options.map((o) => o.text)).toEqual(["A", "B"]);
    expect("options" in (v.paper.questions[2] as object)).toBe(false);
  });

  it("an out-of-order paper from the server is rejected rather than re-sorted", async () => {
    const { d } = deps({ raw: wirePaper([wireQ("descriptive", 1), wireQ("descriptive", 0)]) });
    expect((await loadPaperView(d, ASM)).kind).toBe("error");
  });

  it("labels: option letters, mark wording, and an instruction for every type", () => {
    expect([0, 1, 2].map(optionLabel)).toEqual(["A", "B", "C"]);
    expect(marksLabel(1)).toBe("1 mark");
    expect(marksLabel(2.5)).toBe("2.5 marks");
    const seen = TYPES.map((t) => {
      const p = mapAttemptPaper(wirePaper([wireQ(t, 0)]));
      return answerInstruction((p as AttemptPaper).questions[0] as never);
    });
    expect(new Set(seen).size).toBe(5);
    expect(seen.every((s) => s.length > 0)).toBe(true);
  });
});

describe("empty, error and retry states", () => {
  it("a paper with no questions is the 'empty' view", async () => {
    const { d } = deps({ raw: wirePaper([]) });
    expect((await loadPaperView(d, ASM)).kind).toBe("empty");
  });

  it("a server refusal becomes an error view carrying only the fixed message", async () => {
    const { d } = deps({ paperError: "This attempt is no longer open." });
    expect(await loadPaperView(d, ASM)).toEqual({ kind: "error", message: "This attempt is no longer open." });
  });

  it("a malformed paper becomes the generic error and no content", async () => {
    const { d } = deps({ raw: { nonsense: true } });
    expect(await loadPaperView(d, ASM)).toEqual({ kind: "error", message: ATTEMPT_GENERIC_ERROR });
  });

  it("a thrown error never leaks its text; calling again (retry) can succeed", async () => {
    let n = 0;
    const raw = wirePaper([wireQ("descriptive", 0)]);
    const d: PaperDeps = {
      getOpenAttempt: async () => ({ ok: true, attempt: attemptInfo() }),
      getPaper: async () => {
        n++;
        if (n === 1) throw new Error("connect ECONNRESET 10.0.0.5:5432 password=hunter2");
        const paper = mapAttemptPaper(raw) as AttemptPaper;
        return { ok: true, paper };
      },
    };
    const first = await loadPaperView(d, ASM);
    expect(first).toEqual({ kind: "error", message: ATTEMPT_GENERIC_ERROR });
    expect(JSON.stringify(first)).not.toMatch(/ECONNRESET|hunter2|10\.0\.0\.5/);
    expect((await loadPaperView(d, ASM)).kind).toBe("ready");
  });

  it("a thrown error while looking up the attempt is also contained", async () => {
    const { d } = deps({ open: () => { throw new Error("boom internal"); } });
    expect(await loadPaperView(d, ASM)).toEqual({ kind: "error", message: ATTEMPT_GENERIC_ERROR });
  });
});

describe("no correct answers or grading keys reach the view", () => {
  const LEAK = /correct|explanation|accepted|case_?sensitive|rubric|grading|answer_?key|score|feedback|SECRET/i;

  it("a ready view has no restricted key and no leaked value", async () => {
    const { d } = deps({ raw: wirePaper(TYPES.map((t, i) => wireQ(t, i))) });
    const v = await loadPaperView(d, ASM);
    expect(v.kind).toBe("ready");
    expect(findRestrictedKeys(v)).toEqual([]);
    expect(JSON.stringify(v)).not.toMatch(LEAK);
  });

  it.each([
    ["explanation on a question", (q: Record<string, unknown>) => ({ ...q, explanation: "SECRET" })],
    ["correct_boolean on a question", (q: Record<string, unknown>) => ({ ...q, correct_boolean: true })],
    ["accepted_answers on a question", (q: Record<string, unknown>) => ({ ...q, accepted_answers: ["SECRET"] })],
    ["rubric on a question", (q: Record<string, unknown>) => ({ ...q, rubric: "SECRET" })],
    ["is_correct on an option", (q: Record<string, unknown>) => ({ ...q, options: [{ id: "a", text: "A", is_correct: true }, { id: "b", text: "B" }] })],
  ])("a server payload with %s yields an error view with no content", async (_n, mutate) => {
    const { d } = deps({ raw: wirePaper([mutate(wireQ("single_choice", 0))]) });
    const v = await loadPaperView(d, ASM);
    expect(v).toEqual({ kind: "error", message: ATTEMPT_GENERIC_ERROR });
    expect(JSON.stringify(v)).not.toMatch(/SECRET|Question 0/);
  });
});

describe("static checks on the integration files (source text)", () => {
  const root = process.cwd();
  const read = (p: string) => readFileSync(join(root, p), "utf8");
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
  const SERVER = ["src/components/assessments/attempt-paper-section.tsx", "src/lib/assessments/paper-view.ts"];
  const NEW = [...SERVER, "src/components/assessments/retry-button.tsx"];
  const CLIENT_PAPER = "src/components/assessments/question-paper.tsx";
  const PAGE = "src/app/dashboard/student/assessments/[id]/page.tsx";

  it("the data-loading paper components remain server-safe: no client directive, hooks, browser storage or fetch", () => {
    for (const f of SERVER) {
      const s = strip(read(f));
      expect(s).not.toMatch(/["']use client["']/);
      expect(s).not.toMatch(/\buse(State|Effect|Reducer|Ref|Context|Transition)\b|localStorage|sessionStorage|indexedDB|\bfetch\(|window\./);
    }
  });

  it("the retry button is a client component and takes no props (so it receives no question data)", () => {
    const s = read("src/components/assessments/retry-button.tsx");
    expect(s).toMatch(/^"use client";/);
    expect(s).toMatch(/export function RetryButton\(\)/);
    expect(strip(s)).not.toMatch(/question|paper|option/i);
  });

  it("no new file references a key table, key field, service-role client, or the teacher data layer", () => {
    for (const f of [...NEW, PAGE]) {
      const s = strip(read(f));
      // Built from fragments so this file never contains the service-role names itself
      // (attempt-actions.test.ts scans every file under src/ for them).
      const forbidden = new RegExp(
        ["question_answer_keys", "question_correct_options", "correct_boolean", "accepted_answers", "isCorrect", "explanation", "SERVICE" + "_ROLE", "service" + "_role", "service" + "Role"].join("|"),
      );
      expect(s).not.toMatch(forbidden);
      expect(s).not.toMatch(/assessments\/(data|actions)["']/);
    }
  });

  it("interactive answer-saving, submission and timer logic stays in the client paper component", () => {
    const client = strip(read(CLIENT_PAPER));
    expect(client.startsWith('"use client";')).toBe(true);
    expect(client).toMatch(/submitAttemptAction/);
    expect(client).toMatch(/saveAnswerAction/);
    expect(client).toMatch(/setInterval/);
    for (const f of [...NEW, PAGE]) {
      const s = strip(read(f));
      expect(s).not.toMatch(/submitAttemptAction|startAttemptAction|save_?Answer|attempt_answers|setInterval|setTimeout|secondsRemaining|expiresAt/);
    }
  });

  it("flushes all pending autosaves before requesting submission and blocks submit on a failed flush", () => {
    const s = strip(read(CLIENT_PAPER));
    const flush = s.indexOf("await saverRef.current?.flush()");
    const failedFlushGuard = s.indexOf("if (!flushed || !flushed.ok || flushed.closed)");
    const submit = s.indexOf("await submitAttemptAction({ attemptId })");
    expect(flush).toBeGreaterThanOrEqual(0);
    expect(failedFlushGuard).toBeGreaterThan(flush);
    expect(submit).toBeGreaterThan(failedFlushGuard);
  });

  it("the page still has Start disabled, and the paper is only mounted for an open assessment", () => {
    const s = read(PAGE);
    expect(s).toMatch(/<Button className="w-full" disabled/);
    expect(s).toMatch(/a\.availability === "open" && \(\s*<Suspense/);
  });

  it("no duplicate student assessment page was created", () => {
    const pages: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/^page( \(\d+\))?\.tsx$/.test(name)) pages.push(p.replace(join(root, "src/app/"), "").replaceAll("\\", "/"));
      }
    };
    walk(join(root, "src/app/dashboard/student/assessments"));
    expect(pages.sort()).toEqual(["dashboard/student/assessments/[id]/page.tsx", "dashboard/student/assessments/page.tsx"]);
  });
});
