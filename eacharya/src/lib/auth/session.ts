import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { isRole, redirectTargetFor } from "@/lib/auth/roles";
import type { Profile, Role } from "@/types/app";

export interface SessionProfile {
  userId: string;
  email: string | null;
  profile: Profile;
}

/**
 * Returns the signed-in user's profile, or null when signed out / unconfigured.
 * Uses auth.getUser() (server-validated), never trusting cookies alone.
 * The role always comes from the database, never from the request.
 */
export async function getSessionProfile(): Promise<SessionProfile | null> {
  if (!isSupabaseConfigured()) return null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, avatar_url, role, created_at, updated_at")
    .eq("id", user.id)
    .maybeSingle();

  if (error || !data || !isRole((data as Profile).role)) {
    // Signed in but no usable profile: send to a page that does NOT bounce
    // authenticated users, so this cannot loop.
    redirect("/auth/profile-error");
  }

  return { userId: user.id, email: user.email ?? null, profile: data as Profile };
}

/** Signed-in user's id and role for public pages. Never redirects; null if unavailable. */
export async function getViewer(): Promise<{ userId: string; role: Role } | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;
    const { data } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
    const role = (data as { role?: unknown } | null)?.role;
    return isRole(role) ? { userId: user.id, role } : null;
  } catch {
    return null;
  }
}

/** Requires any signed-in user (all roles). Signed-out visitors go to sign-in and come back. */
export async function requireSession(nextPath: string): Promise<SessionProfile> {
  const session = await getSessionProfile();
  if (!session) redirect(`/sign-in?next=${encodeURIComponent(nextPath)}`);
  return session;
}

/** Lightweight check for public pages (header state). Never redirects. */
export async function isSignedIn(): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return Boolean(user);
  } catch {
    return false;
  }
}

/**
 * Server-side guard for dashboards. Call at the top of every protected page/layout.
 * - signed out  -> /sign-in
 * - wrong role  -> that user's own dashboard (which always admits them, so no loop)
 */
export async function requireRole(area: Role): Promise<SessionProfile> {
  const session = await getSessionProfile();
  const target = redirectTargetFor(session?.profile.role ?? null, area);
  if (target) redirect(target);
  return session as SessionProfile;
}
