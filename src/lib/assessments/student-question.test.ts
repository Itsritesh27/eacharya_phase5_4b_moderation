import { describe, expect, it } from "vitest";
import {
  STUDENT_QUESTION_FIELDS,
  findRestrictedKeys,
  isStudentSafe,
  mapStudentQuestion,
  questionFromEditor,
  type StudentQuestion,
} from "./student-question";
import { mapAttemptPaper } from "./paper";
import { toPreviewQuestions } from "./publish";
import type { EditorQuestion } from "./types";

const ASM = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ATT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const wire = (over: Record<string, unknown> = {}) => ({
  id: "q1", position: 0, type: "single_choice", text: "Which river?", image_url: null, marks: 2,
  options: [{ id: "o1", text: "Ganga" }, { id: "o2", text: "Nile" }],
  ...over,
});

const paperOf = (questions: unknown[]) => ({
  attempt: {
    attempt_id: ATT, assessment_id: ASM, attempt_number: 1, status: "in_progress",
    started_at: "2026-10-19T10:00:00+00:00", expires_at: "2026-10-19T10:30:00+00:00",
    server_now: "2026-10-19T10:00:01+00:00", seconds_remaining: 1799,
  },
  assessment: { id: ASM, title: "Rivers", instructions: "Read", total_marks: 6, duration_minutes: 30 },
  questions,
});

const ALL_TYPES = ["single_choice", "multiple_select", "true_false", "short_answer", "descriptive"] as const;
const wireFor = (type: (typeof ALL_TYPES)[number], i: number) =>
  wire({
    id: `q${i}`, position: i, type,
    options: type === "single_choice" || type === "multiple_select" ? [{ id: `o${i}a`, text: "A" }, { id: `o${i}b`, text: "B" }] : [],
  });

const editor = (over: Partial<EditorQuestion> = {}): EditorQuestion => ({
  id: "e1", type: "descriptive", text: "Explain monsoons.", marks: 5, position: 0, options: [],
  correctBoolean: null, acceptedAnswers: [], caseSensitive: false, explanation: "", ...over,
});

const LEAK = /correct|explanation|accepted|case_?sensitive|rubric|grading|answer_?key|score|feedback|SECRET|BECAUSE/i;

describe("explicit response shape per question type", () => {
  it.each(ALL_TYPES)("%s returns exactly its allow-listed fields", (type) => {
    const q = mapStudentQuestion(wireFor(type, 0));
    expect(q).not.toBeNull();
    expect(Object.keys(q as object).sort()).toEqual([...STUDENT_QUESTION_FIELDS[type]].sort());
  });

  it("only choice types carry options; the others have no options property at all", () => {
    for (const t of ALL_TYPES) {
      const q = mapStudentQuestion(wireFor(t, 0)) as StudentQuestion;
      expect("options" in q).toBe(t === "single_choice" || t === "multiple_select");
    }
  });

  it("preserves question text, marks, position, image and option text/order", () => {
    const q = mapStudentQuestion(wire({ image_url: "https://example.com/m.png", marks: 2.5, position: 3 }));
    expect(q).toMatchObject({ text: "Which river?", marks: 2.5, position: 3, imageUrl: "https://example.com/m.png" });
    expect((q as { options: unknown }).options).toEqual([{ id: "o1", text: "Ganga" }, { id: "o2", text: "Nile" }]);
  });

  it("option objects contain only id and text", () => {
    const q = mapStudentQuestion(wire()) as { options: object[] };
    for (const o of q.options) expect(Object.keys(o).sort()).toEqual(["id", "text"]);
  });
});

describe("restricted fields are rejected on every question type (top level)", () => {
  const FIELDS: [string, unknown][] = [
    ["correct_option_ids", ["o1"]], ["correct_boolean", true], ["accepted_answers", ["x"]], ["case_sensitive", true],
    ["explanation", "BECAUSE"], ["rubric", "private"], ["grading_key", "k"], ["answer_key", "k"], ["internal_score", 3],
    ["is_correct", true], ["feedback", "good"], ["solution", "s"],
  ];
  for (const type of ALL_TYPES) {
    it.each(FIELDS)(`${type}: rejects extra field %s`, (field, value) => {
      const raw = { ...wireFor(type, 0), [field]: value };
      expect(mapStudentQuestion(raw)).toBeNull();
    });
  }
});

describe("restricted fields are rejected in nested option data", () => {
  const OPT: [string, unknown][] = [
    ["is_correct", true], ["isCorrect", true], ["correct", true], ["explanation", "BECAUSE"], ["score", 1], ["feedback", "f"], ["weight", 2],
  ];
  for (const type of ["single_choice", "multiple_select"] as const) {
    it.each(OPT)(`${type}: rejects option field %s`, (field, value) => {
      const raw = wire({ type, options: [{ id: "o1", text: "A", [field]: value }, { id: "o2", text: "B" }] });
      expect(mapStudentQuestion(raw)).toBeNull();
    });
  }

  it("rejects a leak on only the last option, and non-object / duplicate-id options", () => {
    expect(mapStudentQuestion(wire({ options: [{ id: "o1", text: "A" }, { id: "o2", text: "B", is_correct: false }] }))).toBeNull();
    expect(mapStudentQuestion(wire({ options: [{ id: "o1", text: "A" }, "B"] }))).toBeNull();
    expect(mapStudentQuestion(wire({ options: [{ id: "o1", text: "A" }, { id: "o1", text: "B" }] }))).toBeNull();
  });

  it("rejects options smuggled onto a non-choice question", () => {
    for (const t of ["true_false", "short_answer", "descriptive"]) {
      expect(mapStudentQuestion(wire({ type: t, options: [{ id: "o1", text: "A", is_correct: true }] }))).toBeNull();
      expect(mapStudentQuestion(wire({ type: t, options: [{ id: "o1", text: "A" }] }))).toBeNull();
    }
  });
});

describe("unsupported or malformed questions are handled safely (null, never thrown)", () => {
  it.each([
    ["null", null], ["undefined", undefined], ["a string", "q"], ["a number", 7], ["an array", []], ["empty object", {}],
    ["unknown type", wire({ type: "essay" })], ["numeric type", wire({ type: 1 })], ["null type", wire({ type: null })],
    ["prototype-ish type", wire({ type: "__proto__" })], ["empty text", wire({ text: "" })], ["non-string text", wire({ text: 5 })],
    ["zero marks", wire({ marks: 0 })], ["string marks", wire({ marks: "2" })], ["NaN marks", wire({ marks: Number.NaN })],
    ["negative position", wire({ position: -1 })], ["fractional position", wire({ position: 1.5 })],
    ["http image", wire({ image_url: "http://x.com/a.png" })], ["javascript image", wire({ image_url: "javascript:alert(1)" })],
    ["options not an array", wire({ options: "A,B" })], ["choice with no options", wire({ options: [] })],
    ["missing options key", (() => { const q = wire() as Record<string, unknown>; delete q.options; return q; })()],
  ])("%s", (_n, raw) => {
    expect(() => mapStudentQuestion(raw)).not.toThrow();
    expect(mapStudentQuestion(raw)).toBeNull();
  });

  it("an unsupported type is null even with no options (no accidental non-choice fallthrough)", () => {
    for (const type of ["essay", "matching", "fill_blank", "TRUE_FALSE", "descriptive "]) {
      expect(mapStudentQuestion(wire({ type, options: [] }))).toBeNull();
    }
  });

  it("an unsupported type anywhere rejects the whole paper", () => {
    expect(mapAttemptPaper(paperOf([wireFor("descriptive", 0), wire({ id: "q9", position: 1, type: "matching" })]))).toBeNull();
  });
});

describe("full paper: all five types together never expose restricted data", () => {
  const paper = mapAttemptPaper(paperOf(ALL_TYPES.map((t, i) => wireFor(t, i))));

  it("maps and serialises with no restricted key or value", () => {
    expect(paper).not.toBeNull();
    expect(paper?.questions).toHaveLength(5);
    expect(JSON.stringify(paper)).not.toMatch(LEAK);
    expect(findRestrictedKeys(paper)).toEqual([]);
  });

  it("a single leaked option deep inside any one question rejects the whole paper", () => {
    for (let i = 0; i < 2; i++) {
      const qs = ALL_TYPES.map((t, j) => wireFor(t, j));
      (qs[i] as { options: object[] }).options[1] = { id: "oX", text: "B", is_correct: true };
      expect(mapAttemptPaper(paperOf(qs))).toBeNull();
    }
  });

  it("a leak on any one of the five types rejects the whole paper", () => {
    for (let i = 0; i < 5; i++) {
      const qs = ALL_TYPES.map((t, j) => wireFor(t, j));
      qs[i] = { ...(qs[i] as object), explanation: "BECAUSE" } as never;
      expect(mapAttemptPaper(paperOf(qs))).toBeNull();
    }
  });
});

describe("findRestrictedKeys / isStudentSafe (second line of defence)", () => {
  it("finds restricted keys at any depth and inside arrays, by path", () => {
    expect(findRestrictedKeys({ a: [{ b: { explanation: "x" } }], options: [{ id: "1", isCorrect: true }] })).toEqual([
      "$.a[0].b.explanation", "$.options[0].isCorrect",
    ]);
  });
  it("does not flag harmless keys, or the word 'correct' inside question text", () => {
    expect(findRestrictedKeys({ id: "1", text: "Choose the correct answer", marks: 1, options: [{ id: "a", text: "correct" }] })).toEqual([]);
  });
  it("survives circular structures", () => {
    const o: Record<string, unknown> = { id: 1 };
    o.self = o;
    expect(findRestrictedKeys(o)).toEqual([]);
  });
  it("isStudentSafe rejects a question with an extra key or a bad option, accepts a clean one", () => {
    const clean = mapStudentQuestion(wire()) as StudentQuestion;
    expect(isStudentSafe([clean])).toBe(true);
    expect(isStudentSafe([{ ...clean, hint: "x" } as never])).toBe(false);
    expect(isStudentSafe([{ ...clean, options: [{ id: "a", text: "A", isCorrect: true }] } as never])).toBe(false);
    expect(isStudentSafe([{ ...clean, type: "essay" } as never])).toBe(false);
  });
});

describe("feedback release: no student shape carries an explanation or feedback", () => {
  it("no allow-list contains an explanation/feedback/correctness field", () => {
    for (const t of ALL_TYPES) expect(STUDENT_QUESTION_FIELDS[t].join(",")).not.toMatch(LEAK);
  });
  it("an explanation is refused even when it is empty or null", () => {
    expect(mapStudentQuestion(wire({ explanation: "" }))).toBeNull();
    expect(mapStudentQuestion(wire({ explanation: null }))).toBeNull();
  });
});

describe("teacher key-bearing data -> student shape (preview) and teacher workflows", () => {
  const full = (over: Partial<EditorQuestion>) =>
    editor({ correctBoolean: true, acceptedAnswers: ["SECRET"], caseSensitive: true, explanation: "BECAUSE", ...over });

  it("questionFromEditor drops keys for every type, including nested option flags", () => {
    const qs = [
      full({ id: "a", type: "single_choice", options: [{ id: "o1", text: "A", isCorrect: true }, { id: "o2", text: "B", isCorrect: false }] }),
      full({ id: "b", type: "multiple_select", options: [{ text: "A", isCorrect: true }, { text: "B", isCorrect: true }] }),
      full({ id: "c", type: "true_false" }),
      full({ id: "d", type: "short_answer" }),
      full({ id: "e", type: "descriptive", options: [{ text: "stray", isCorrect: true }] }),
    ].map((q) => questionFromEditor(q));
    expect(qs.every((q) => q !== null)).toBe(true);
    expect(JSON.stringify(qs)).not.toMatch(LEAK);
    expect(findRestrictedKeys(qs)).toEqual([]);
    expect(isStudentSafe(qs as StudentQuestion[])).toBe(true);
    expect(qs[4] && "options" in qs[4]).toBe(false);
  });

  it("toPreviewQuestions keeps text, marks and option text, drops keys, and skips unsupported types", () => {
    const out = toPreviewQuestions([
      full({ id: "a", type: "single_choice", marks: 2, options: [{ id: "o1", text: "A", isCorrect: true }, { text: "B", isCorrect: false }] }),
      full({ id: "z", type: "essay" as never }),
    ]);
    expect(out).toEqual([{ id: "a", type: "single_choice", text: "Explain monsoons.", marks: 2, options: [{ id: "o1", text: "A" }, { id: "a-1", text: "B" }] }]);
    expect(JSON.stringify(out)).not.toMatch(LEAK);
  });

  it("does not mutate the teacher's EditorQuestion, so authoring keeps its answer keys", () => {
    const q = full({ id: "a", type: "single_choice", options: [{ id: "o1", text: "A", isCorrect: true }, { id: "o2", text: "B", isCorrect: false }] });
    const before = JSON.stringify(q);
    questionFromEditor(q);
    toPreviewQuestions([q]);
    expect(JSON.stringify(q)).toBe(before);
    expect(q.options[0]?.isCorrect).toBe(true);
    expect(q.explanation).toBe("BECAUSE");
  });
});
