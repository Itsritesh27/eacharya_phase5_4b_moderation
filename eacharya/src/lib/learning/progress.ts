export interface CourseProgress {
  completed: number;
  total: number;
  /** Whole-number percent 0..100. 0 when the course has no published lessons. */
  percent: number;
}

/**
 * Course progress from real data: only PUBLISHED lessons count, and only
 * completion records that match one of those lessons. A lesson that was
 * unpublished or deleted after completion no longer inflates the percentage.
 */
export function computeCourseProgress(
  publishedLessonIds: readonly string[],
  completedLessonIds: ReadonlySet<string>,
): CourseProgress {
  const unique = new Set(publishedLessonIds);
  const total = unique.size;
  let completed = 0;
  for (const id of unique) if (completedLessonIds.has(id)) completed += 1;
  const percent = total === 0 ? 0 : Math.round((completed / total) * 100);
  return { completed, total, percent };
}

/** Clamp a saved video position to a sane integer number of seconds. */
export function clampPosition(seconds: unknown): number {
  const n = typeof seconds === "number" ? seconds : Number(seconds);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(Math.floor(n), 86400);
}

/** Position to resume from; rewinds a few seconds and restarts finished videos. */
export function resumeFrom(positionSeconds: number, durationSeconds?: number): number {
  const pos = clampPosition(positionSeconds);
  if (pos < 5) return 0;
  if (durationSeconds && pos >= durationSeconds - 5) return 0;
  return pos - 2;
}

/** Adds up several courses' progress into one overall figure (from real counts only). */
export function combineProgress(list: readonly CourseProgress[]): CourseProgress {
  const completed = list.reduce((n, p) => n + p.completed, 0);
  const total = list.reduce((n, p) => n + p.total, 0);
  return { completed, total, percent: total === 0 ? 0 : Math.round((completed / total) * 100) };
}
