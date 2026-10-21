export type LiveStatus = "scheduled" | "live" | "ended" | "cancelled";
export type JoinRole = "host" | "participant";

/** Students may enter this many minutes before the scheduled start. */
export const EARLY_JOIN_MINUTES = 10;
/** Students may still enter this many minutes after the scheduled end (classes run over). */
export const LATE_GRACE_MINUTES = 30;
/** Hosts may open the room this many minutes before the start. */
export const HOST_EARLY_MINUTES = 60;

export const TITLE_MIN = 3;
export const TITLE_MAX = 150;
export const DESCRIPTION_MAX = 1000;
export const DURATION_MIN = 10;
export const DURATION_MAX = 240;

const MIN = 60_000;

export interface SessionTiming {
  startsAt: string | Date;
  durationMinutes: number;
  status: LiveStatus;
}

export type JoinDecision = { ok: true } | { ok: false; reason: string };

/** Pure access-window rule, mirrored by the join route and unit-tested. Role/enrolment is checked in the database. */
export function joinDecision(s: SessionTiming, role: JoinRole, now: Date = new Date()): JoinDecision {
  if (s.status === "cancelled") return { ok: false, reason: "This class was cancelled." };
  if (s.status === "ended") return { ok: false, reason: "This class has ended." };

  const start = new Date(s.startsAt).getTime();
  const end = start + s.durationMinutes * MIN;
  const t = now.getTime();

  if (role === "host") {
    if (t < start - HOST_EARLY_MINUTES * MIN) return { ok: false, reason: "You can open the room up to an hour before the start." };
    return { ok: true };
  }
  if (t < start - EARLY_JOIN_MINUTES * MIN) {
    return { ok: false, reason: `The class opens ${EARLY_JOIN_MINUTES} minutes before it starts.` };
  }
  if (t > end + LATE_GRACE_MINUTES * MIN && s.status !== "live") {
    return { ok: false, reason: "This class is over." };
  }
  // A class the teacher has already started stays open to students even if it runs long.
  return { ok: true };
}

export type JoinState = "upcoming" | "open" | "live" | "over" | "cancelled";

/** Label for lists: when can a student press Join? */
export function joinState(s: SessionTiming, now: Date = new Date()): JoinState {
  if (s.status === "cancelled") return "cancelled";
  if (s.status === "ended") return "over";
  if (s.status === "live") return "live";
  const d = joinDecision(s, "participant", now);
  if (d.ok) return "open";
  return new Date(s.startsAt).getTime() > now.getTime() ? "upcoming" : "over";
}

export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  if (s < 60) return s === 0 ? "0 min" : "<1 min";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r === 0 ? `${h} h` : `${h} h ${r} min`;
}
