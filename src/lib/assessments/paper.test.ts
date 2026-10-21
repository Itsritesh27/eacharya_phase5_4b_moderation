import { describe, expect, it } from "vitest";
import { mapAttemptPaper } from "./paper";
import { attemptErrorMessage } from "./attempts";

const ASM = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ATT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const attempt = (over: Record<string, unknown> = {}) => ({
  attempt_id: ATT,
  assessment_id: ASM,
  attempt_number: 1,
  status: "in_progress",
  started_at: "2026-10-19T10:00:00+00:00",
  expires_at: "2026-10-19T10:30:00+00:00",
  server_now: "2026-10-19T10:00:01+00:00",
  seconds_remaining: 1799,
  ...over,
});

const question = (over: Record<string, unknown> = {}) => ({
  id: "q1",
  position: 0,
  type: "single_choice",
  text: "Which river?",
  image_url: null,
  marks: 2,
  options: [
    { id: "o1", text: "Ganga" },
    { id: "o2", text: "Nile" },
  ],
  ...over,
});

const paper = (over: Record<string, unknown> = {}) => ({
  attempt: attempt(),
  assessment: { id: ASM, title: "Rivers", instructions: "Read", total_marks: 6, duration_minutes: 30 },
  questions: [
    question(),
    question({ id: "q2", position: 1, type: "multiple_select", options: [{ id: "o3", text: "A" }, { id: "o4", text: "B" }] }),
    question({ id: "q3", position: 2, type: "true_false", options: [], marks: 1 }),
    question({ id: "q4", position: 3, type: "short_answer", options: [], marks: 1 }),
    question({ id: "q5", position: 4, type: "descriptive", options: [], marks: 0.5, image_url: "https://example.com/m.png" }),
  ],
  ...over,
});

describe("mapAttemptPaper: valid paper", () => {
  it("maps every question type, keeps order, marks, options and attempt timing", () => {
    const p = mapAttemptPaper(paper());
    expect(p).not.toBeNull();
    expect(p?.questions.map((q) => q.type)).toEqual([
      "single_choice", "multiple_select", "true_false", "short_answer", "descriptive",
    ]);
    expect(p?.questions.map((q) => q.position)).toEqual([0, 1, 2, 3, 4]);
    const q0 = p?.questions[0];
    expect(q0 && "options" in q0 ? q0.options.map((o) => o.text) : []).toEqual(["Ganga", "Nile"]);
    expect(p?.questions[4]?.imageUrl).toBe("https://example.com/m.png");
    expect(p?.questions[4]?.marks).toBe(0.5);
    expect(p?.attempt.attemptId).toBe(ATT);
    expect(p?.attempt.secondsRemaining).toBe(1799);
    expect(p?.assessment).toEqual({ id: ASM, title: "Rivers", instructions: "Read", totalMarks: 6, durationMinutes: 30 });
  });

  it("accepts an untimed attempt (null deadline) and an untimed assessment", () => {
    const p = mapAttemptPaper(
      paper({
        attempt: attempt({ expires_at: null, seconds_remaining: null }),
        assessment: { id: ASM, title: "T", instructions: "", total_marks: 6, duration_minutes: null },
      }),
    );
    expect(p?.attempt.expiresAt).toBeNull();
    expect(p?.attempt.secondsRemaining).toBeNull();
    expect(p?.assessment.durationMinutes).toBeNull();
  });

  it("never carries an answer-bearing field on the mapped objects", () => {
    const p = mapAttemptPaper(paper());
    const text = JSON.stringify(p);
    expect(text).not.toMatch(/correct|explanation|accepted|case_?sensitive|"answers?"/i);
    expect(Object.keys(p?.questions[0] ?? {}).sort()).toEqual(["id", "imageUrl", "marks", "options", "position", "text", "type"]);
    const first = p?.questions[0];
    expect(Object.keys(first && "options" in first ? (first.options[0] ?? {}) : {}).sort()).toEqual(["id", "text"]);
  });
});

describe("mapAttemptPaper: fails closed", () => {
  it.each([
    ["null", null],
    ["a string", "paper"],
    ["an array", []],
    ["an empty object", {}],
  ])("rejects %s", (_n, raw) => {
    expect(mapAttemptPaper(raw)).toBeNull();
  });

  it("rejects a leaked key on a question (explanation)", () => {
    const raw = paper({ questions: [question({ explanation: "Because Ganga" })] });
    expect(mapAttemptPaper(raw)).toBeNull();
  });

  it("rejects a leaked key on an option (is_correct)", () => {
    const raw = paper({ questions: [question({ options: [{ id: "o1", text: "A", is_correct: true }, { id: "o2", text: "B" }] })] });
    expect(mapAttemptPaper(raw)).toBeNull();
  });

  it("rejects a leaked top-level key, attempt key and assessment key", () => {
    expect(mapAttemptPaper(paper({ answers: [] }))).toBeNull();
    expect(mapAttemptPaper(paper({ attempt: attempt({ user_id: "u1" }) }))).toBeNull();
    expect(
      mapAttemptPaper(paper({ assessment: { id: ASM, title: "T", instructions: "", total_marks: 6, duration_minutes: null, passing_marks: 3 } })),
    ).toBeNull();
  });

  it("rejects a missing key", () => {
    const q = question() as Record<string, unknown>;
    delete q.image_url;
    expect(mapAttemptPaper(paper({ questions: [q] }))).toBeNull();
  });

  it("rejects a paper whose attempt is not in progress", () => {
    expect(mapAttemptPaper(paper({ attempt: attempt({ status: "submitted" }) }))).toBeNull();
    expect(mapAttemptPaper(paper({ attempt: attempt({ status: "expired" }) }))).toBeNull();
  });

  it("rejects an assessment id that does not match the attempt", () => {
    expect(
      mapAttemptPaper(paper({ assessment: { id: "other", title: "T", instructions: "", total_marks: 6, duration_minutes: null } })),
    ).toBeNull();
  });

  it("rejects an unknown question type, bad marks and a non-https image", () => {
    expect(mapAttemptPaper(paper({ questions: [question({ type: "essay" })] }))).toBeNull();
    expect(mapAttemptPaper(paper({ questions: [question({ marks: 0 })] }))).toBeNull();
    expect(mapAttemptPaper(paper({ questions: [question({ marks: "2" })] }))).toBeNull();
    expect(mapAttemptPaper(paper({ questions: [question({ image_url: "http://example.com/a.png" })] }))).toBeNull();
    expect(mapAttemptPaper(paper({ questions: [question({ image_url: "javascript:alert(1)" })] }))).toBeNull();
  });

  it("rejects options on a non-choice question and no options on a choice question", () => {
    expect(mapAttemptPaper(paper({ questions: [question({ type: "true_false" })] }))).toBeNull();
    expect(mapAttemptPaper(paper({ questions: [question({ options: [] })] }))).toBeNull();
  });

  it("rejects duplicate ids and out-of-order or repeated positions", () => {
    expect(mapAttemptPaper(paper({ questions: [question(), question({ position: 1 })] }))).toBeNull();
    expect(mapAttemptPaper(paper({ questions: [question({ position: 1 }), question({ id: "q2", position: 0 })] }))).toBeNull();
    expect(mapAttemptPaper(paper({ questions: [question(), question({ id: "q2", position: 0 })] }))).toBeNull();
  });
});

describe("EA007 wording", () => {
  it("has fixed student-safe text and does not reveal why", () => {
    expect(attemptErrorMessage({ code: "EA007" })).toBe("This attempt is no longer open.");
  });
});
