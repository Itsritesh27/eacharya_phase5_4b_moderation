const DATE = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
const DATE_TIME = new Intl.DateTimeFormat("en-IN", {
  day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata",
});

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : DATE.format(d);
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : DATE_TIME.format(d);
}

/** updated_at moves a few milliseconds after created_at on insert, so only a real gap counts as an edit. */
export function wasEdited(createdAt: string, updatedAt: string): boolean {
  return new Date(updatedAt).getTime() - new Date(createdAt).getTime() > 60_000;
}

/**
 * Turns a search box value into text that is safe to place inside a PostgREST `or(...)` filter:
 * only letters (including combining marks, so Hindi and other scripts work), digits, spaces, apostrophes, dots and hyphens survive, so commas, parentheses, quotes,
 * `%` and `_` (LIKE wildcards) cannot change the filter. Returns "" when nothing searchable is left.
 */
export function toSearchPattern(q: string): string {
  return q.replace(/[^\p{L}\p{M}\p{N}\s'.-]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 80);
}

export function excerpt(text: string, max = 160): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1).trimEnd()}…`;
}
