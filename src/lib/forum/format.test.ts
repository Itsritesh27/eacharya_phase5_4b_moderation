import { describe, expect, it } from "vitest";
import { excerpt, formatDate, formatDateTime, toSearchPattern, wasEdited } from "./format";

describe("forum formatting", () => {
  it("formats dates in India time and survives bad input", () => {
    expect(formatDate("2026-10-17T20:00:00Z")).toContain("2026");
    expect(formatDate("2026-10-17T20:00:00Z")).toContain("18"); // 01:30 IST next day
    expect(formatDateTime("2026-10-17T10:00:00Z")).toMatch(/3:30/);
    expect(formatDate("garbage")).toBe("");
  });
  it("treats only a real gap as an edit", () => {
    expect(wasEdited("2026-10-17T10:00:00.000Z", "2026-10-17T10:00:00.050Z")).toBe(false);
    expect(wasEdited("2026-10-17T10:00:00Z", "2026-10-17T10:05:00Z")).toBe(true);
  });
  it("makes search text safe for a PostgREST filter", () => {
    expect(toSearchPattern("monsoon rain")).toBe("monsoon rain");
    expect(toSearchPattern("100%_sure")).toBe("100 sure");
    expect(toSearchPattern('a,b)c("d"')).toBe("a b c d");
    expect(toSearchPattern("title.eq.x),or(id.gt.0")).toBe("title.eq.x or id.gt.0");
    expect(toSearchPattern("%%%")).toBe("");
    expect(toSearchPattern("मानसून")).toBe("मानसून");
    expect(toSearchPattern("x".repeat(300))).toHaveLength(80);
  });
  it("builds a short excerpt", () => {
    expect(excerpt("a  b\n c")).toBe("a b c");
    expect(excerpt("x".repeat(500), 50)).toHaveLength(50);
  });
});
