import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { idSchema } from "@/lib/live-sessions/validation";

export const dynamic = "force-dynamic";

/** Sent with navigator.sendBeacon when a student closes the tab, so their time in class is closed out. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (idSchema.safeParse(id).success && isSupabaseConfigured()) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) await supabase.rpc("leave_live_session", { p_session: id });
  }
  return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
