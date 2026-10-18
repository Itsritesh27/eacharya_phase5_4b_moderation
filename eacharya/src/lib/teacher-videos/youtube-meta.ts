import { parseOembed } from "./links";

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const TIMEOUT_MS = 5000;

/**
 * Looks up a YouTube video's public title through YouTube's oEmbed endpoint.
 * No API key is needed. Runs on the server only; the request URL is rebuilt from a
 * validated 11-character id, so the teacher can never point this at another host.
 * Returns null for private, removed or non-embeddable videos, or if YouTube is
 * unreachable; callers then let the teacher type the title by hand.
 */
export async function fetchYoutubeMeta(
  videoId: string,
): Promise<{ title: string; author: string | null } | null> {
  if (!VIDEO_ID.test(videoId)) return null;
  const watch = `https://www.youtube.com/watch?v=${videoId}`;
  const endpoint = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(watch)}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(endpoint, { signal: controller.signal, cache: "no-store" });
    if (!res.ok) return null;
    return parseOembed(await res.json());
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
