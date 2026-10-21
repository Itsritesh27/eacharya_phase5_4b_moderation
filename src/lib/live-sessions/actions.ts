"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { isMissingSchema } from "./data";
import { closeRoom } from "./livekit";
import { fieldErrorsFrom, idSchema, scheduleSchema } from "./validation";
import type { LiveResult } from "./types";

const GENERIC = "Something went wrong. Please try again.";
const SIGN_IN = "Please sign in again to continue.";

/** User id comes only from the server-validated session. RLS and constraints are the second check. */
async function authed() {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user ? { supabase, userId: user.id } : null;
}

export async function scheduleLiveSessionAction(input: unknown): Promise<LiveResult<{ id: string }>> {
  const parsed = scheduleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error) };
  const ctx = await authed();
  if (!ctx) return { ok: false, error: SIGN_IN };
  const d = parsed.data;

  if (new Date(d.startsAt).getTime() < Date.now() - 5 * 60_000) {
    return { ok: false, error: "Choose a start time in the future.", fieldErrors: { startsAt: "Choose a start time in the future." } };
  }

  const { data, error } = await ctx.supabase
    .from("live_sessions")
    .insert({
      course_id: d.courseId, created_by: ctx.userId, title: d.title, description: d.description,
      starts_at: d.startsAt, duration_minutes: d.durationMinutes,
    })
    .select("id")
    .single();

  if (error || !data) {
    if (isMissingSchema(error)) return { ok: false, error: "Live classes are not set up yet. Run the live classes migration first." };
    if (error?.code === "42501") return { ok: false, error: "You can only schedule classes for courses you created." };
    return { ok: false, error: GENERIC };
  }
  revalidatePath("/dashboard/teacher/live");
  return { ok: true, id: (data as { id: string }).id };
}

export async function cancelLiveSessionAction(id: string): Promise<LiveResult> {
  if (!idSchema.safeParse(id).success) return { ok: false, error: GENERIC };
  const ctx = await authed();
  if (!ctx) return { ok: false, error: SIGN_IN };
  const { data, error } = await ctx.supabase
    .from("live_sessions").update({ status: "cancelled" })
    .eq("id", id).eq("created_by", ctx.userId).eq("status", "scheduled").select("id");
  if (error) return { ok: false, error: GENERIC };
  if (!data || data.length === 0) return { ok: false, error: "Only a class that has not started can be cancelled." };
  revalidatePath("/dashboard/teacher/live");
  revalidatePath("/dashboard/student/live");
  return { ok: true };
}

export async function endLiveSessionAction(id: string): Promise<LiveResult> {
  if (!idSchema.safeParse(id).success) return { ok: false, error: GENERIC };
  const ctx = await authed();
  if (!ctx) return { ok: false, error: SIGN_IN };

  const { data: row } = await ctx.supabase.from("live_sessions").select("room_name").eq("id", id).eq("created_by", ctx.userId).maybeSingle();
  const { data: ended, error } = await ctx.supabase.rpc("end_live_session", { p_session: id });
  if (error) return { ok: false, error: GENERIC };
  if (!ended) return { ok: false, error: "This class is already over or is not yours." };

  const room = (row as { room_name?: string } | null)?.room_name;
  if (room) await closeRoom(room);
  revalidatePath("/dashboard/teacher/live");
  revalidatePath(`/dashboard/teacher/live/${id}`);
  revalidatePath("/dashboard/student/live");
  return { ok: true };
}

/** Called by the browser when a student leaves. A fallback for when LiveKit webhooks are not configured. */
export async function leaveLiveSessionAction(id: string): Promise<void> {
  if (!idSchema.safeParse(id).success) return;
  const ctx = await authed();
  if (!ctx) return;
  await ctx.supabase.rpc("leave_live_session", { p_session: id });
}
