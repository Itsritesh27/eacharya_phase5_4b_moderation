import { describe, expect, it } from "vitest";
import { displayStatus, getPublishIssues, moveItem, sumMarks, toPreviewQuestions } from "./publish";
import type { EditorQuestion } from "./types";

function q(over: Partial<EditorQuestion>): EditorQuestion {
  return {
    id: "q1",
    type: "descriptive",
    text: "Explain monsoons.",
    marks: 5,
    position: 0,
    options: [],
    correctBoolean: null,
    acceptedAnswers: [],
    caseSensitive: false,
    explanation: "",
    ...over,
  };
}

describe("getPublishIssues", () => {
  it("blocks an assessment with no questions", () => {
    expect(getPublishIssues([], 1)).toHaveLength(1);
  });

  it("passes a complete assessment", () => {
    expect(getPublishIssues([q({})], 5)).toEqual([]);
  });

  it("flags a marks mismatch", () => {
    expect(getPublishIssues([q({ marks: 4 })], 5)[0]).toMatch(/add up to 4/);
  });

  it("checks keys per question type, numbering from 1", () => {
    const issues = getPublishIssues(
      [
        q({ id: "a", type: "single_choice", options: [{ text: "A", isCorrect: false }, { text: "B", isCorrect: false }], marks: 1 }),
        q({ id: "b", type: "true_false", marks: 1 }),
        q({ id: "c", type: "short_answer", marks: 1 }),
      ],
      3,
    );
    expect(issues).toEqual([
      "Question 1 needs exactly one correct option.",
      "Question 2 needs a correct true/false answer.",
      "Question 3 needs at least one accepted answer.",
    ]);
  });

  it("adds decimal marks without float drift", () => {
    expect(sumMarks([{ marks: 0.1 }, { marks: 0.2 }])).toBe(0.3);
  });
});

describe("displayStatus", () => {
  const now = new Date("2026-10-17T10:00:00Z");
  it("shows draft and published as stored", () => {
    expect(displayStatus("draft", null, now)).toBe("draft");
    expect(displayStatus("published", null, now)).toBe("published");
    expect(displayStatus("published", "2026-12-01T00:00:00Z", now)).toBe("published");
  });
  it("shows closed once a published assessment passes its closing time", () => {
    expect(displayStatus("published", "2026-10-01T00:00:00Z", now)).toBe("closed");
  });
  it("never shows a draft as closed", () => {
    expect(displayStatus("draft", "2026-10-01T00:00:00Z", now)).toBe("draft");
  });
});

describe("toPreviewQuestions", () => {
  it("contains no answer information", () => {
    const preview = toPreviewQuestions([
      q({
        type: "single_choice",
        options: [
          { id: "o1", text: "A", isCorrect: true },
          { id: "o2", text: "B", isCorrect: false },
        ],
        correctBoolean: true,
        acceptedAnswers: ["secret"],
        explanation: "because",
      }),
    ]);
    const json = JSON.stringify(preview);
    expect(json).not.toMatch(/isCorrect|correct|secret|because|acceptedAnswers|explanation/);
  });
});

describe("moveItem", () => {
  it("moves within range and refuses outside it", () => {
    expect(moveItem(["a", "b", "c"], 1, -1)).toEqual(["b", "a", "c"]);
    expect(moveItem(["a", "b", "c"], 1, 1)).toEqual(["a", "c", "b"]);
    expect(moveItem(["a", "b"], 0, -1)).toBeNull();
    expect(moveItem(["a", "b"], 1, 1)).toBeNull();
  });
});
