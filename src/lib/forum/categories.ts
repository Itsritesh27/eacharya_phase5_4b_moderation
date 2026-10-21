/**
 * Forum taxonomy. This is code, not database content. Slugs are stored in discussions.category, where a
 * CHECK constraint (migration 20261018000001_phase5_2_forum.sql) enforces the same list.
 */
export const FORUM_GRADES = [9, 10, 11, 12] as const;
export type ForumGrade = (typeof FORUM_GRADES)[number];

export const FORUM_CATEGORIES = [
  { slug: "physical-geography", label: "Physical Geography", blurb: "Landforms, rocks, rivers, oceans and the atmosphere." },
  { slug: "human-geography", label: "Human Geography", blurb: "Population, settlements, economy and culture." },
  { slug: "indian-geography", label: "Indian Geography", blurb: "India's regions, resources, climate and people." },
  { slug: "cartography", label: "Cartography", blurb: "Map reading, scale, projections and symbols." },
  { slug: "climate", label: "Climate", blurb: "Weather, monsoons, climate types and change." },
  { slug: "practical-work", label: "Practical Work", blurb: "Fieldwork, data tasks and Geography Lab activities." },
] as const;
export type ForumCategorySlug = (typeof FORUM_CATEGORIES)[number]["slug"];

export const MAX_QUERY_LENGTH = 80;

export function parseForumGrade(v: string | undefined): ForumGrade | undefined {
  const n = Number(v);
  return (FORUM_GRADES as readonly number[]).includes(n) ? (n as ForumGrade) : undefined;
}

export function parseForumCategory(v: string | undefined): ForumCategorySlug | undefined {
  return FORUM_CATEGORIES.find((c) => c.slug === v)?.slug;
}

/** Trim, collapse whitespace, cap length. Never interpolated into SQL or filters by this phase. */
export function cleanQuery(v: string | undefined): string {
  return (v ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_QUERY_LENGTH);
}

export const MAX_PAGE = 500;

/** 1-based page number from a query string; anything invalid becomes 1. */
export function parsePage(v: string | undefined): number {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= MAX_PAGE ? n : 1;
}

export const FORUM_SORTS = [
  { value: "newest", label: "Newest" },
  { value: "liked", label: "Most liked" },
] as const;
export type ForumSort = (typeof FORUM_SORTS)[number]["value"];

/** Anything unknown becomes the default, so a hand-edited URL can never break the query. */
export function parseForumSort(v: string | undefined): ForumSort {
  return v === "liked" ? "liked" : "newest";
}

export function categoryLabel(slug: string): string {
  return FORUM_CATEGORIES.find((c) => c.slug === slug)?.label ?? "General";
}

export function forumHref(f: { q?: string; grade?: ForumGrade; category?: ForumCategorySlug; sort?: ForumSort; page?: number }): string {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  if (f.grade) p.set("grade", String(f.grade));
  if (f.category) p.set("category", f.category);
  if (f.sort && f.sort !== "newest") p.set("sort", f.sort);
  if (f.page && f.page > 1) p.set("page", String(f.page));
  const s = p.toString();
  return s ? `/forum?${s}` : "/forum";
}

/** Link for the personal bookmarks list. */
export function bookmarksHref(page?: number): string {
  return page && page > 1 ? `/forum/bookmarks?page=${page}` : "/forum/bookmarks";
}
