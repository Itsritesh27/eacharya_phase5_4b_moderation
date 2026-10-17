"use client";

import { useEffect, useRef } from "react";
import { saveLessonPositionAction } from "@/lib/learning/actions";
import { resumeFrom } from "@/lib/learning/progress";
import type { VideoSource } from "@/lib/learning/video";

const SAVE_EVERY_MS = 15_000;

/**
 * Plays a validated video source. The `source` comes from parseVideoUrl() on the
 * server, so only allowlisted YouTube embeds and https video files ever reach here.
 * Position is saved (and restored) for direct videos; YouTube embeds cannot report
 * their position without extra scripts, so only "last opened" is recorded for them.
 */
export function VideoPlayer({
  source,
  title,
  lessonId,
  startAt,
  canSave,
}: {
  source: VideoSource;
  title: string;
  lessonId: string;
  startAt: number;
  canSave: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastSaved = useRef(0);

  // Record that the lesson was opened (creates the in-progress row, refreshes "last accessed").
  useEffect(() => {
    if (!canSave) return;
    void saveLessonPositionAction(lessonId, startAt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonId, canSave]);

  if (source.kind === "youtube") {
    return (
      <div className="aspect-video w-full overflow-hidden rounded-card bg-forest-950 shadow-card">
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

  return (
    <div className="overflow-hidden rounded-card bg-forest-950 shadow-card">
      <video
        ref={videoRef}
        controls
        playsInline
        preload="metadata"
        className="aspect-video w-full"
        onLoadedMetadata={(e) => {
          const el = e.currentTarget;
          const target = resumeFrom(startAt, Number.isFinite(el.duration) ? el.duration : undefined);
          if (target > 0) el.currentTime = target;
        }}
        onTimeUpdate={() => save(false)}
        onPause={() => save(true)}
        onEnded={() => save(true)}
      >
        <source src={source.src} type={source.mime} />
        Your browser cannot play this video.
      </video>
    </div>
  );
}
