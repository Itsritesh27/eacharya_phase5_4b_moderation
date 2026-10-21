"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, Settings2 } from "lucide-react";
import { saveLessonPositionAction } from "@/lib/learning/actions";
import { resumeFrom } from "@/lib/learning/progress";
import { pickQuality, type VideoSource } from "@/lib/learning/video";

const SAVE_EVERY_MS = 15_000;
const PREF_KEY = "eacharya.videoQuality"; // "auto" or a pixel height, e.g. "720"

function readPref(): string | null {
  try {
    return window.localStorage.getItem(PREF_KEY);
  } catch {
    return null;
  }
}
function writePref(value: string) {
  try {
    window.localStorage.setItem(PREF_KEY, value);
  } catch {
    /* private mode: preference just isn't remembered */
  }
}

/**
 * Plays a validated video source. The `source` comes from resolveLessonVideo() on the
 * server, so only allowlisted YouTube embeds, https video files and HLS playlists reach here.
 *
 * Quality: students can pick a resolution. The choice is remembered on this
 * device, applied to every lesson, and switching keeps the current time and play state. The
 * player never lowers quality on its own once a fixed resolution is chosen.
 *
 * Position is saved (and restored) for direct/HLS videos; YouTube embeds cannot report their
 * position without extra scripts, so only "last opened" is recorded for them.
 */
export function VideoPlayer({
  source,
  title,
  lessonId,
  startAt,
  canSave,
  allowDownload = true,
}: {
  source: VideoSource;
  title: string;
  lessonId: string;
  startAt: number;
  canSave: boolean;
  allowDownload?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastSaved = useRef(0);
  const resumeAt = useRef(startAt);

  const qualities = useMemo(() => (source.kind === "direct" ? source.qualities : []), [source]);
  const [qIndex, setQIndex] = useState(0);
  const [menu, setMenu] = useState(false);

  // Record that the lesson was opened (creates the in-progress row, refreshes "last accessed").
  useEffect(() => {
    if (!canSave) return;
    void saveLessonPositionAction(lessonId, startAt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonId, canSave]);

  // Apply the remembered quality for direct files (before the user presses play).
  useEffect(() => {
    if (source.kind !== "direct" || source.qualities.length < 2) return;
    const pref = readPref();
    if (pref && pref !== "auto") setQIndex(pickQuality(source.qualities, Number(pref)));
  }, [source]);

  // HLS streams: played natively where the browser supports it (Safari/iOS).
  useEffect(() => {
    if (source.kind !== "hls") return;
    const el = videoRef.current;
    if (el && el.canPlayType("application/vnd.apple.mpegurl")) el.src = source.src;
  }, [source]);

  const chooseDirect = useCallback(
    (index: number) => {
      const el = videoRef.current;
      if (el) resumeAt.current = el.currentTime;
      const wasPlaying = !!el && !el.paused;
      setQIndex(index);
      const q = qualities[index];
      if (q?.height) writePref(String(q.height));
      setMenu(false);
      // Resume playing after the new file loads.
      if (wasPlaying && el) {
        const resume = () => {
          void el.play().catch(() => undefined);
          el.removeEventListener("loadedmetadata", resume);
        };
        el.addEventListener("loadedmetadata", resume);
      }
    },
    [qualities],
  );

  if (source.kind === "youtube") {
    const files = allowDownload ? (source.downloads ?? []) : [];
    return (
      <div className="overflow-hidden rounded-card bg-forest-950 shadow-card">
        <div className="aspect-video w-full">
        <iframe
          title={`${title} (video)`}
          src={`${source.embedUrl}?rel=0&modestbranding=1`}
          className="h-full w-full"
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
          sandbox="allow-scripts allow-same-origin allow-presentation"
          allow="encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
        />
        </div>
        {files.length > 0 && (
          <div className="flex flex-wrap items-center justify-end gap-1.5 bg-forest-900 px-3 py-2 text-sm text-white">
            <span className="inline-flex items-center gap-1.5 pr-1 font-semibold">
              <Download className="h-4 w-4" aria-hidden /> Download
            </span>
            {files.map((q, i) => (
              <a
                key={q.src}
                href={`/api/lessons/${lessonId}/download?q=${i}`}
                className="inline-flex h-9 items-center rounded-lg bg-brand-600 px-3 font-semibold hover:bg-brand-500"
                aria-label={`Download ${title} in ${q.label}`}
              >
                {q.label}
              </a>
            ))}
          </div>
        )}
      </div>
    );
  }

  function save(force = false) {
    const el = videoRef.current;
    if (!el || !canSave) return;
    const now = Date.now();
    if (!force && now - lastSaved.current < SAVE_EVERY_MS) return;
    lastSaved.current = now;
    void saveLessonPositionAction(lessonId, el.currentTime);
  }

  const current = source.kind === "direct" ? qualities[qIndex] : undefined;
  const showQualityMenu = source.kind === "direct" && qualities.length > 1;
  const canDownload = allowDownload && source.kind === "direct";

  return (
    <div className="overflow-hidden rounded-card bg-forest-950 shadow-card">
      <video
        ref={videoRef}
        key={source.kind === "direct" ? current?.src : source.src}
        controls
        controlsList={canDownload ? undefined : "nodownload"}
        playsInline
        preload="metadata"
        className="aspect-video w-full"
        onLoadedMetadata={(e) => {
          const el = e.currentTarget;
          const target = resumeFrom(resumeAt.current, Number.isFinite(el.duration) ? el.duration : undefined);
          if (target > 0) el.currentTime = target;
        }}
        onTimeUpdate={() => save(false)}
        onPause={() => save(true)}
        onEnded={() => save(true)}
      >
        {source.kind === "direct" && current && <source src={current.src} type={current.mime} />}
        Your browser cannot play this video.
      </video>

      {(showQualityMenu || canDownload) && (
        <div className="relative flex flex-wrap items-center justify-end gap-2 bg-forest-900 px-3 py-2 text-sm text-white">
          {showQualityMenu && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setMenu((m) => !m)}
                aria-haspopup="listbox"
                aria-expanded={menu}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-white/10 px-3 font-semibold hover:bg-white/20"
              >
                <Settings2 className="h-4 w-4" aria-hidden />
                Quality:{" "}
                {current?.label ?? "Original"}
              </button>
              {menu && (
                <ul
                  role="listbox"
                  aria-label="Video quality"
                  className="absolute bottom-11 right-0 z-10 min-w-[9rem] overflow-hidden rounded-xl border border-white/10 bg-forest-950 py-1 shadow-card"
                >
                  {qualities.map((q, i) => (
                    <li key={q.src}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={i === qIndex}
                        onClick={() => chooseDirect(i)}
                        className="block w-full px-4 py-2 text-left hover:bg-white/10 aria-selected:font-bold"
                      >
                        {q.label}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {canDownload && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center gap-1.5 pr-1 font-semibold">
                <Download className="h-4 w-4" aria-hidden /> Download
              </span>
              {qualities.map((q, i) => (
                <a
                  key={q.src}
                  href={`/api/lessons/${lessonId}/download?q=${i}`}
                    className="inline-flex h-9 items-center rounded-lg bg-brand-600 px-3 font-semibold hover:bg-brand-500"
                  aria-label={`Download ${title} in ${q.label}`}
                >
                  {q.label}
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
