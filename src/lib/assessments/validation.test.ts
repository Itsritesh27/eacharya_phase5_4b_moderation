import { describe, expect, it } from "vitest";
import {
  assessmentSettingsSchema,
  createAssessmentSchema,
  fieldErrorsFrom,
  normaliseQuestion,
  questionInputSchema,
} from "./validation";

const uuid = "11111111-1111-4111-8111-111111111111";

const settings = {
  title: "Rivers quiz",
  description: "",
  instructions: "",
  unitId: null,
  durationMinutes: 30,
  attemptLimit: null,
  opensAt: null,
  closesAt: null,
  passingMarks: null,
};

const question = {
  assessmentId: uuid,
  type: "single_choice" as const,
  text: "Which is the longest river in India?",
  marks: 2,
  explanation: "",
  options: [{ text: "Ganga" }, { text: "Yamuna" }],
  correctIndexes: [0],
  correctBoolean: null,
  acceptedAnswers: [],
  caseSensitive: false,
};

describe("assessment settings", () => {
  it("accepts valid settings", () => {
    expect(assessmentSettingsSchema.safeParse(settings).success).toBe(true);
  });

  it("requires a title and a duration", () => {
    const r = assessmentSettingsSchema.safeParse({ ...settings, title: "  ", durationMinutes: null });
    expect(r.success).toBe(false);
    if (!r.success) {
      const e = fieldErrorsFrom(r.error);
      expect(e.title).toMatch(/title/i);
      expect(e.durationMinutes).toMatch(/duration/i);
    }
  });

  it("limits duration to 1-600 whole minutes", () => {
    expect(assessmentSettingsSchema.safeParse({ ...settings, durationMinutes: 0 }).success).toBe(false);
    expect(assessmentSettingsSchema.safeParse({ ...settings, durationMinutes: 601 }).success).toBe(false);
    expect(assessmentSettingsSchema.safeParse({ ...settings, durationMinutes: 1.5 }).success).toBe(false);
  });

  it("rejects a closing time that is not after the opening time", () => {
    const r = assessmentSettingsSchema.safeParse({
      ...settings,
      opensAt: "2026-11-01T10:00:00.000Z",
      closesAt: "2026-11-01T10:00:00.000Z",
    });
    expect(r.success).toBe(false);
  });

  it("requires a course when creating", () => {
    const { passingMarks: _unused, ...rest } = settings;
    void _unused;
    expect(createAssessmentSchema.safeParse({ ...rest, courseId: "nope" }).success).toBe(false);
    expect(createAssessmentSchema.safeParse({ ...rest, courseId: uuid }).success).toBe(true);
  });
});

describe("question input", () => {
  it("accepts a valid single-choice question", () => {
    expect(questionInputSchema.safeParse(question).success).toBe(true);
  });

  it("needs two non-empty options and exactly one correct option", () => {
    expect(questionInputSchema.safeParse({ ...question, options: [{ text: "Only one" }] }).success).toBe(false);
    expect(questionInputSchema.safeParse({ ...question, options: [{ text: "A" }, { text: "" }] }).success).toBe(false);
    expect(questionInputSchema.safeParse({ ...question, correctIndexes: [] }).success).toBe(false);
    expect(questionInputSchema.safeParse({ ...question, correctIndexes: [0, 1] }).success).toBe(false);
  });

  it("allows several correct options for multiple select, but at least one", () => {
    const ms = { ...question, type: "multiple_select" as const };
    expect(questionInputSchema.safeParse({ ...ms, correctIndexes: [0, 1] }).success).toBe(true);
    expect(questionInputSchema.safeParse({ ...ms, correctIndexes: [] }).success).toBe(false);
  });

  it("needs a true/false answer", () => {
    const tf = { ...question, type: "true_false" as const, options: [], correctIndexes: [] };
    expect(questionInputSchema.safeParse(tf).success).toBe(false);
    expect(questionInputSchema.safeParse({ ...tf, correctBoolean: false }).success).toBe(true);
  });

  it("needs at least one accepted answer for short answer", () => {
    const sa = { ...question, type: "short_answer" as const, options: [], correctIndexes: [] };
    expect(questionInputSchema.safeParse({ ...sa, acceptedAnswers: ["", "  "] }).success).toBe(false);
    expect(questionInputSchema.safeParse({ ...sa, acceptedAnswers: ["Equator"] }).success).toBe(true);
  });

  it("long answer needs no key", () => {
    const d = { ...question, type: "descriptive" as const, options: [], correctIndexes: [] };
    expect(questionInputSchema.safeParse(d).success).toBe(true);
  });

  it("rejects zero, negative or over-precise marks", () => {
    expect(questionInputSchema.safeParse({ ...question, marks: 0 }).success).toBe(false);
    expect(questionInputSchema.safeParse({ ...question, marks: -1 }).success).toBe(false);
    expect(questionInputSchema.safeParse({ ...question, marks: 1.234 }).success).toBe(false);
    expect(questionInputSchema.safeParse({ ...question, marks: 1.25 }).success).toBe(true);
  });

  it("normalise drops fields that do not belong to the type", () => {
    const parsed = questionInputSchema.parse({
      ...question,
      type: "descriptive",
      acceptedAnswers: ["x"],
      correctBoolean: true,
    });
    const n = normaliseQuestion(parsed);
    expect(n.options).toEqual([]);
    expect(n.correctIndexes).toEqual([]);
    expect(n.correctBoolean).toBeNull();
    expect(n.acceptedAnswers).toEqual([]);
  });
});
