import { parseVideoUrl, type VideoSource } from "@/lib/learning/video";

export const MAX_BATCH = 20;
export const MAX_TITLE = 200;

export interface ParsedLink {
  /** Canonical URL that is stored (YouTube links are rebuilt as watch URLs). */
  url: string;
  source: VideoSource;
  /** Identity used to drop duplicates: same YouTube video = same key, however it was pasted. */
  key: string;
}

export function linkKey(source: VideoSource): string {
  return source.kind === "youtube" ? `yt:${source.videoId}` : `url:${source.src}`;
}

export function canonicalUrl(source: VideoSource): string {
  return source.kind === "youtube" ? source.watchUrl : source.src;
}

/**
 * Pulls video links out of whatever the teacher pasted (one per line, space or
 * comma separated). Only links accepted by parseVideoUrl() survive; the rest are
 * counted as rejected so the UI can say so instead of silently dropping them.
 */
export function extractVideoLinks(text: string): {
  links: ParsedLink[];
  rejected: string[];
  duplicates: number;
} {
  const tokens = text
    .split(/[\s,]+/)
    .map((t) => t.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const links: ParsedLink[] = [];
  const rejected: string[] = [];
  let duplicates = 0;

  for (const token of tokens) {
    const source = parseVideoUrl(token);
    if (!source) {
      rejected.push(token);
      continue;
    }
    const key = linkKey(source);
    if (seen.has(key)) {
      duplicates += 1;
      continue;
    }
    seen.add(key);
    links.push({ url: canonicalUrl(source), source, key });
  }
  return { links, rejected, duplicates };
}

export function youtubeThumbnail(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
}

/** Trim, collapse whitespace, cap length. Returns "" when nothing usable is left. */
export function cleanTitle(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.replace(/\s+/g, " ").trim().slice(0, MAX_TITLE);
}

/** Fallback title for direct files, e.g. ".../river-systems_part-1.mp4" -> "river systems part 1". */
export function titleFromFilename(url: string): string {
  try {
    const last = new URL(url).pathname.split("/").filter(Boolean).pop() ?? "";
    const base = decodeURIComponent(last).replace(/\.[a-z0-9]+$/i, "");
    return cleanTitle(base.replace(/[-_]+/g, " "));
  } catch {
    return "";
  }
}

/** Reads the fields we need from a YouTube oEmbed JSON response. */
export function parseOembed(json: unknown): { title: string; author: string | null } | null {
  if (!json || typeof json !== "object") return null;
  const o = json as Record<string, unknown>;
  const title = cleanTitle(o.title);
  if (!title) return null;
  const author = cleanTitle(o.author_name);
  return { title, author: author || null };
}
