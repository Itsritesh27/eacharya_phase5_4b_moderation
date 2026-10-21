/**
 * Cleans free-text search input before it is placed into a PostgREST `or()`
 * filter. Only letters, numbers, spaces and a few safe symbols survive, so
 * commas, parentheses, wildcards and quotes can never alter the filter.
 */
export function sanitizeSearch(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}\s\-']/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}

export const PAGE_SIZE = 12;

export function parsePage(raw: string | null | undefined): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 1000) return 1;
  return n;
}
