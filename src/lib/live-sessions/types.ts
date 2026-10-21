import type { LiveStatus } from "./rules";

export interface LiveSession {
  id: string;
  courseId: string;
  courseTitle: string;
  title: string;
  description: string;
  startsAt: string;
  durationMinutes: number;
  status: LiveStatus;
  createdBy: string;
}

export interface AttendanceRow {
  userId: string;
  fullName: string;
  firstJoinedAt: string | null;
  lastLeftAt: string | null;
  joinCount: number;
  totalSeconds: number;
  isInRoom: boolean;
}

export type LiveResult<T = object> = ({ ok: true } & T) | { ok: false; error: string; fieldErrors?: Record<string, string> };
