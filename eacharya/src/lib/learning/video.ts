export type VideoSource =
  | { kind: "youtube"; videoId: string; embedUrl: string; watchUrl: string }
  | { kind: "direct"; src: string; mime: string };

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "youtube-nocookie.com", "www.youtube-nocookie.com"]);

const DIRECT_TYPES: Record<string, string> = {
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".ogv": "video/ogg",
};

function youtubeIdFrom(url: URL): string | null {
  const host = url.hostname.toLowerCase();

  if (host === "youtu.be") {
    const id = url.pathname.slice(1).split("/")[0] ?? "";
    return YOUTUBE_ID.test(id) ? id : null;
  }

  if (YOUTUBE_HOSTS.has(host)) {
    if (url.pathname === "/watch") {
      const id = url.searchParams.get("v") ?? "";
      return YOUTUBE_ID.test(id) ? id : null;
    }
    const m = /^\/(?:embed|shorts|live)\/([^/?#]+)/.exec(url.pathname);
    if (m && m[1] && YOUTUBE_ID.test(m[1])) return m[1];
  }
  return null;
}

/**
 * Validates a teacher-supplied video URL against an allowlist and returns a
 * safe description of how to play it, or null if it is not supported.
 *
 * - YouTube links are NEVER embedded as given: only the 11-character video id is
 *   extracted, and the embed URL is rebuilt on youtube-nocookie.com.
 * - Direct files must be https and end in .mp4, .webm or .ogv.
 * - Everything else (http, javascript:, data:, other hosts, credentials) is rejected.
 */
export function parseVideoUrl(raw: string | null | undefined): VideoSource | null {
  if (!raw) return null;
  const value = raw.trim();
  if (value.length === 0 || value.length > 500) return null;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  if (url.protocol !== "https:") return null;
  if (url.username || url.password) return null;

  const id = youtubeIdFrom(url);
  if (id) {
    return {
      kind: "youtube",
      videoId: id,
      embedUrl: `https://www.youtube-nocookie.com/embed/${id}`,
      watchUrl: `https://www.youtube.com/watch?v=${id}`,
    };
  }

  const path = url.pathname.toLowerCase();
  const ext = Object.keys(DIRECT_TYPES).find((e) => path.endsWith(e));
  if (ext) {
    return { kind: "direct", src: url.toString(), mime: DIRECT_TYPES[ext] as string };
  }

  return null;
}
