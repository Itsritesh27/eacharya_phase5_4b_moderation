import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createJoinToken, isLiveKitConfigured } from "@/lib/live-sessions/livekit";
import { joinDecision, type JoinRole, type LiveStatus } from "@/lib/live-sessions/rules";
import { idSchema } from "@/lib/live-sessions/validation";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });

/**
 * Issues a LiveKit token only after checking, on the server:
 *  1. the caller is signed in,
 *  2. the database says they are the teacher who owns the class or a student enrolled in its course,
 *  3. the class is inside its joining window.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!idSchema.safeParse(id).success) return json({ error: "Class not found." }, 404);
  if (!isSupabaseConfigured()) return json({ error: "Not available." }, 503);
  if (!isLiveKitConfigured()) return json({ error: "Live classes are not configured yet." }, 503);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ error: "Please sign in again." }, 401);

  const { data: s } = await supabase
    .from("live_sessions").select("id, room_name, starts_at, duration_minutes, status").eq("id", id).maybeSingle();
  if (!s) return json({ error: "Class not found." }, 404);
  const session = s as { id: string; room_name: string; starts_at: string; duration_minutes: number; status: LiveStatus };

  // Role/enrolment check lives in the database; for a student it also records attendance.
  // Check the time window first so a student who is too early is not recorded as present.
  const { data: profile } = await supabase.from("profiles").select("full_name, role").eq("id", user.id).maybeSingle();
  const isOwnerRole = (profile as { role?: string } | null)?.role === "teacher";
  const timing = { startsAt: session.starts_at, durationMinutes: session.duration_minutes, status: session.status };
  const guess: JoinRole = isOwnerRole ? "host" : "participant";
  const early = joinDecision(timing, guess);
  if (!early.ok) return json({ error: early.reason }, 403);

  const { data: role, error } = await supabase.rpc("join_live_session", { p_session: id });
  if (error || (role !== "host" && role !== "participant")) {
    return json({ error: "You do not have access to this class." }, 403);
  }
  // A teacher who is not the owner of this class comes back as "participant" only if enrolled; apply the real role.
  const decision = joinDecision(timing, role);
  if (!decision.ok) return json({ error: decision.reason }, 403);

  if (role === "host" && session.status === "scheduled") {
    await supabase.from("live_sessions")
      .update({ status: "live", started_at: new Date().toISOString() })
      .eq("id", id).eq("created_by", user.id).eq("status", "scheduled");
  }

  const result = await createJoinToken({
    room: session.room_name, userId: user.id, name: (profile as { full_name?: string } | null)?.full_name ?? "", role,
  });
  if (!result) return json({ error: "Live classes are not configured yet." }, 503);
  return json({ token: result.token, url: result.url, role });
}
