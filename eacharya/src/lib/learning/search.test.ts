import { describe, expect, it } from "vitest";
import { PAGE_SIZE, parsePage, sanitizeSearch } from "./search";

describe("sanitizeSearch", () => {
  it("keeps normal words", () => {
    expect(sanitizeSearch("  monsoon   climate ")).toBe("monsoon climate");
  });

  it("removes characters that could change a PostgREST filter", () => {
    expect(sanitizeSearch("a,title.eq.x),(b")).toBe("a title eq x b");
    expect(sanitizeSearch("100%*")).toBe("100");
  });

  it("handles empty input and limits length", () => {
    expect(sanitizeSearch(undefined)).toBe("");
    expect(sanitizeSearch("x".repeat(500)).length).toBe(60);
  });
});

describe("parsePage", () => {
  it("defaults to 1 for bad values", () => {
    for (const v of [undefined, "", "0", "-2", "abc", "1.5", "99999"]) expect(parsePage(v)).toBe(1);
  });
  it("accepts valid pages", () => {
    expect(parsePage("3")).toBe(3);
    expect(PAGE_SIZE).toBeGreaterThan(0);
  });
});
