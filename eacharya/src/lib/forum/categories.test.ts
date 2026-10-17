import { describe, expect, it } from "vitest";
import { FORUM_CATEGORIES, bookmarksHref, categoryLabel, cleanQuery, forumHref, parseForumCategory, parseForumGrade, parseForumSort, parsePage } from "./categories";

describe("forum params", () => {
  it("accepts only classes 9-12", () => {
    expect(parseForumGrade("12")).toBe(12);
    for (const bad of [undefined, "", "8", "13", "x", "9.5", "<b>"]) expect(parseForumGrade(bad)).toBeUndefined();
  });
  it("accepts only known categories", () => {
    expect(parseForumCategory("climate")).toBe("climate");
    for (const bad of [undefined, "", "Climate", "nope", "climate; drop"]) expect(parseForumCategory(bad)).toBeUndefined();
  });
  it("cleans and caps the query", () => {
    expect(cleanQuery("  monsoon \n  rainfall ")).toBe("monsoon rainfall");
    expect(cleanQuery("a".repeat(500))).toHaveLength(80);
    expect(cleanQuery(undefined)).toBe("");
  });
  it("builds hrefs and has unique category slugs", () => {
    expect(forumHref({})).toBe("/forum");
    expect(forumHref({ q: "a b", grade: 10, category: "climate" })).toBe("/forum?q=a+b&grade=10&category=climate");
    expect(new Set(FORUM_CATEGORIES.map((c) => c.slug)).size).toBe(FORUM_CATEGORIES.length);
  });
  it("parses page numbers and adds them to hrefs only beyond page 1", () => {
    expect(parsePage("3")).toBe(3);
    for (const bad of [undefined, "", "0", "-1", "2.5", "abc", "99999"]) expect(parsePage(bad)).toBe(1);
    expect(forumHref({ page: 1 })).toBe("/forum");
    expect(forumHref({ grade: 9, page: 2 })).toBe("/forum?grade=9&page=2");
  });
  it("labels categories and falls back safely", () => {
    expect(categoryLabel("climate")).toBe("Climate");
    expect(categoryLabel("unknown")).toBe("General");
  });
  it("parses sort safely and keeps it in hrefs only when it is not the default", () => {
    expect(parseForumSort("liked")).toBe("liked");
    for (const bad of [undefined, "", "newest", "LIKED", "popular", "liked;drop"]) expect(parseForumSort(bad)).toBe("newest");
    expect(forumHref({ sort: "newest" })).toBe("/forum");
    expect(forumHref({ q: "rain", grade: 11, category: "climate", sort: "liked", page: 3 })).toBe("/forum?q=rain&grade=11&category=climate&sort=liked&page=3");
  });
  it("builds the bookmarks href", () => {
    expect(bookmarksHref()).toBe("/forum/bookmarks");
    expect(bookmarksHref(1)).toBe("/forum/bookmarks");
    expect(bookmarksHref(2)).toBe("/forum/bookmarks?page=2");
  });
});
