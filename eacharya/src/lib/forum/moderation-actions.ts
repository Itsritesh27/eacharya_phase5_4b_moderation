"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { isRole } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { isMissingSchema } from "./data";
import { MODERATION_PATH, canModerateForum } from "./moderation";
import type { ForumResult } from "./types";
import { fieldErrorsFrom, moderateReportSchema, restoreContentSchema } from "./validation";

const GENERIC = "Something went wrong. Please try again.";
const NOT_ALLOWED = "You do not have permission to moderate the forum.";

/**
 * Every moderation action re-checks, on the server and per call: (1) the session user (auth.getUser, never a cookie
 * alone), (2) that user's role as stored in the database. Only then is the database function called, and that function
 * checks the role AGAIN and takes the moderator id from auth.uid(). A moderator id is never accepted from the request,
 * and no service-role key is used anywhere.
 */
type Guard = { supabase: SupabaseClient; error: null } | { supabase: null; error: string };

async function moderator(): Promise<Guard> {
  if (!isSupabaseConfigured()) return { supabase: null, error: "Please sign in again to continue." };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase: null, error: "Please sign in again to continue." };
  const { data } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  const role = (data as { role?: unknown } | null)?.role;
  if (!isRole(role) || !canModerateForum(role)) return { supabase: null, error: NOT_ALLOWED };
  return { supabase, error: null };
}

interface DbError { code?: string; message?: string }

/** Our functions raise plain-language messages (errcode 23514); those are safe to show. Anything else is not. */
function friendly(error: DbError): string {
  if (isMissingSchema(error)) return "Moderation is not available yet. Please try again later.";
  if (error.code === "42501") return NOT_ALLOWED;
  if (error.code === "P0002") return "This report no longer exists.";
  if (error.code === "23514" && error.message && !/violates check constraint/i.test(error.message)) return error.message;
  return GENERIC;
}

type ModerationResult = ForumResult<{ status: string; contentAction: "hidden" | "restored" | null }>;

function shape(data: unknown): { status: string; contentAction: "hidden" | "restored" | null } {
  const d = (data ?? {}) as { status?: unknown; content_action?: unknown };
  return {
    status: typeof d.status === "string" ? d.status : "",
    contentAction: d.content_action === "hidden" || d.content_action === "restored" ? d.content_action : null,
  };
}

export async function moderateReportAction(input: unknown): Promise<ModerationResult> {
  // Authorization first, so an unauthorised caller learns nothing about how input is validated.
  const ctx = await moderator();
  if (!ctx.supabase) return { ok: false, error: ctx.error };

  const parsed = moderateReportSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error) };
  const d = parsed.data;

  const { data, error } = await ctx.supabase.rpc("forum_moderate_report", {
    p_report_id: d.reportId, p_status: d.status, p_note: d.note, p_hide_content: d.hideContent,
  });
  if (error) return { ok: false, error: friendly(error) };

  revalidatePath(MODERATION_PATH);
  if (d.hideContent) revalidatePath("/forum");
  return { ok: true, ...shape(data) };
}

export async function restoreReportContentAction(input: unknown): Promise<ModerationResult> {
  const ctx = await moderator();
  if (!ctx.supabase) return { ok: false, error: ctx.error };

  const parsed = restoreContentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error) };

  const { data, error } = await ctx.supabase.rpc("forum_restore_report_content", { p_report_id: parsed.data.reportId, p_note: parsed.data.note });
  if (error) return { ok: false, error: friendly(error) };

  revalidatePath(MODERATION_PATH);
  revalidatePath("/forum");
  return { ok: true, ...shape(data) };
}
