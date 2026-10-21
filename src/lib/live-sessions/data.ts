import { createClient } from "@/lib/supabase/server";
import type { AttendanceRow, LiveSession } from "./types";
import type { LiveStatus } from "./rules";

interface Row {
  id: string; course_id: string; title: string; description: string; starts_at: string;
  duration_minutes: number; status: LiveStatus; created_by: string;
  course: { title: string } | { title: string }[] | null;
}

const COLS = "id, course_id, title, description, starts_at, duration_minutes, status, created_by, course:courses(title)";

function map(r: Row): LiveSession {
  const course = Array.isArray(r.course) ? r.course[0] : r.course;
  return {
    id: r.id, courseId: r.course_id, courseTitle: course?.title ?? "Course", title: r.title,
    description: r.description, startsAt: r.starts_at, durationMinutes: r.duration_minutes,
    status: r.status, createdBy: r.created_by,
  };
}

/** True when the live-classes migration has not been applied yet. */
export function isMissingSchema(error: { code?: string } | null | undefined): boolean {
  return error?.code === "42P01" || error?.code === "PGRST205" || error?.code === "42883" || error?.code === "PGRST202";
}

/** RLS decides what each role sees: teachers their own, students their enrolled courses' sessions. */
export async function listSessions(): Promise<{ sessions: LiveSession[]; missingSchema: boolean }> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("live_sessions").select(COLS).order("starts_at", { ascending: false }).limit(200);
  if (error) {
    if (!isMissingSchema(error)) console.error("[live] list failed", { code: error.code });
    return { sessions: [], missingSchema: isMissingSchema(error) };
  }
  return { sessions: ((data ?? []) as unknown as Row[]).map(map), missingSchema: false };
}

export async function getSession(id: string): Promise<LiveSession | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("live_sessions").select(COLS).eq("id", id).maybeSingle();
  return data ? map(data as unknown as Row) : null;
}

export async function getTeacherCourses(userId: string): Promise<{ id: string; title: string }[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("courses").select("id, title").eq("created_by", userId).order("title");
  return (data ?? []) as { id: string; title: string }[];
}

export async function getAttendance(sessionId: string): Promise<AttendanceRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_live_session_attendance", { p_session: sessionId });
  if (error) { console.error("[live] attendance failed", { code: error.code }); return []; }
  return ((data ?? []) as Array<{
    user_id: string; full_name: string; first_joined_at: string | null; last_left_at: string | null;
    join_count: number; total_seconds: number; is_in_room: boolean;
  }>).map((r) => ({
    userId: r.user_id, fullName: r.full_name || "Student", firstJoinedAt: r.first_joined_at,
    lastLeftAt: r.last_left_at, joinCount: r.join_count, totalSeconds: r.total_seconds, isInRoom: r.is_in_room,
  }));
}
