import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

/**
 * The signed-in student's own Supabase session, or null.
 *
 * Shared by the student attempt actions (Phase B / C2) and the answer actions (Phase D) so the same early
 * rejection applies everywhere. It is NOT what protects the data: every database function re-checks the caller
 * from auth.uid(). It runs as the user's own session (no elevated key exists anywhere in this project) and
 * never reads anything except the caller's own role.
 *
 * This is a plain module, not a "use server" file, so it can export a helper that is not a server action.
 */
export async function studentContext() {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if ((data as { role?: string } | null)?.role !== "student") return null;
  return { supabase };
}
