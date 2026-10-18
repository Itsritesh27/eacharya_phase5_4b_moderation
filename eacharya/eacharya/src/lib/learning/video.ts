export interface VideoQuality {
  /** Shown to students, e.g. "1080p". */
  label: string;
  /** Pixel height, used for ordering (0 = unknown). */
  height: number;
  src: string;
  mime: string;
}

export type VideoSource =
  /** `downloads`: optional self-hosted files students can save while watching on YouTube. */
  | { kind: "youtube"; videoId: string; embedUrl: string; watchUrl: string; downloads?: VideoQuality[] }
  /** Direct files. `qualities` is sorted best first; `src`/`mime` mirror qualities[0]. */
  | { kind: "direct"; src: string; mime: string; qualities: VideoQuality[] }
  /** Adaptive HLS stream (.m3u8): the player offers Auto plus each rendition. */
  | { kind: "hls"; src: string };

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
    const mime = DIRECT_TYPES[ext] as string;
    const src = url.toString();
    return { kind: "direct", src, mime, qualities: [{ label: "Original", height: 0, src, mime }] };
  }

  if (path.endsWith(".m3u8")) return { kind: "hls", src: url.toString() };

  return null;
}

const MAX_QUALITIES = 8;

/**
 * Builds the player source for a lesson. Prefers the multi-quality `video_sources`
 * list (each URL validated as a direct file, or a single HLS playlist) and falls back
 * to the single `video_url`. Returns null when nothing playable is configured.
 */
export function resolveLessonVideo(
  videoUrl: string | null | undefined,
  videoSources: unknown,
): VideoSource | null {
  const main = parseVideoUrl(videoUrl);
  const list = Array.isArray(videoSources) ? videoSources.slice(0, MAX_QUALITIES) : [];

  const qualities: VideoQuality[] = [];
  let hls: VideoSource | null = null;
  const seen = new Set<string>();
  for (const raw of list) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as { url?: unknown; label?: unknown; height?: unknown };
    const parsed = typeof item.url === "string" ? parseVideoUrl(item.url) : null;
    if (!parsed) continue;
    if (parsed.kind === "hls") {
      hls ??= parsed;
      continue;
    }
    if (parsed.kind !== "direct" || seen.has(parsed.src)) continue;
    seen.add(parsed.src);
    const height = typeof item.height === "number" && item.height > 0 && item.height <= 4320 ? Math.round(item.height) : 0;
    const label =
      typeof item.label === "string" && item.label.trim()
        ? item.label.trim().slice(0, 12)
        : height > 0
          ? `${height}p`
          : "Original";
    qualities.push({ label, height, src: parsed.src, mime: parsed.mime });
  }
  qualities.sort((a, b) => b.height - a.height);

  // A YouTube lesson keeps playing on YouTube; the listed files become download-only.
  if (main?.kind === "youtube") return qualities.length > 0 ? { ...main, downloads: qualities } : main;

  if (hls) return hls; // adaptive stream wins; it carries its own renditions
  if (qualities.length > 0) {
    const best = qualities[0] as VideoQuality;
    return { kind: "direct", src: best.src, mime: best.mime, qualities };
  }
  return main;
}

/**
 * Index of the quality to start with for a remembered resolution: the best one that is not
 * higher than `wantedHeight`, else the lowest available. `qualities` must be sorted best first.
 */
export function pickQuality(qualities: VideoQuality[], wantedHeight: number): number {
  if (!qualities.length) return 0;
  const i = qualities.findIndex((q) => q.height > 0 && q.height <= wantedHeight);
  return i === -1 ? qualities.length - 1 : i;
}
