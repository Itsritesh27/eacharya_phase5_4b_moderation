import { describe, expect, it } from "vitest";
import { clampPosition, combineProgress, computeCourseProgress, resumeFrom } from "./progress";

describe("computeCourseProgress", () => {
  it("is 0 of 0 (0%) for a course with no published lessons", () => {
    expect(computeCourseProgress([], new Set())).toEqual({ completed: 0, total: 0, percent: 0 });
  });

  it("calculates from real completed lessons", () => {
    const r = computeCourseProgress(["a", "b", "c", "d"], new Set(["a", "c"]));
    expect(r).toEqual({ completed: 2, total: 4, percent: 50 });
  });

  it("ignores completions for lessons that are not currently published", () => {
    const r = computeCourseProgress(["a", "b"], new Set(["a", "gone-lesson"]));
    expect(r).toEqual({ completed: 1, total: 2, percent: 50 });
  });

  it("does not double count duplicate ids", () => {
    const r = computeCourseProgress(["a", "a", "b"], new Set(["a"]));
    expect(r).toEqual({ completed: 1, total: 2, percent: 50 });
  });

  it("reaches 100 when everything is complete", () => {
    expect(computeCourseProgress(["a", "b"], new Set(["a", "b"])).percent).toBe(100);
  });
});

describe("clampPosition", () => {
  it("rejects bad values", () => {
    expect(clampPosition(-5)).toBe(0);
    expect(clampPosition(Number.NaN)).toBe(0);
    expect(clampPosition("abc")).toBe(0);
    expect(clampPosition(undefined)).toBe(0);
  });

  it("floors and caps", () => {
    expect(clampPosition(12.9)).toBe(12);
    expect(clampPosition(10_000_000)).toBe(86400);
  });
});

describe("resumeFrom", () => {
  it("starts from the beginning for tiny positions", () => {
    expect(resumeFrom(3)).toBe(0);
  });

  it("rewinds slightly", () => {
    expect(resumeFrom(100)).toBe(98);
  });

  it("restarts videos that were watched to the end", () => {
    expect(resumeFrom(598, 600)).toBe(0);
  });
});

describe("combineProgress", () => {
  it("is 0% with no courses", () => {
    expect(combineProgress([])).toEqual({ completed: 0, total: 0, percent: 0 });
  });

  it("weights by lesson count, not by course", () => {
    const a = computeCourseProgress(["a1", "a2"], new Set(["a1", "a2"])); // 2/2
    const b = computeCourseProgress(["b1", "b2", "b3", "b4"], new Set()); // 0/4
    expect(combineProgress([a, b])).toEqual({ completed: 2, total: 6, percent: 33 });
  });
});
