import { NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createWebhookReceiver } from "@/lib/live-sessions/livekit";

export const dynamic = "force-dynamic";

const IDENTITY = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * LiveKit calls this when people join or leave a room, giving exact attendance times.
 * Every request is verified with LiveKit's signature; unsigned or tampered requests are rejected.
 * This is the ONLY place the Supabase service-role key is used, and it can only call one database
 * function (live_webhook_event). Optional: without it attendance still works from join/leave in the app.
 *
 * LiveKit Cloud -> Settings -> Webhooks -> add  https://<your-site>/api/livekit/webhook
 */
export async function POST(req: Request) {
  const receiver = createWebhookReceiver();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!receiver || !supabaseUrl || !serviceKey) return new NextResponse("Not configured", { status: 501 });

  const body = await req.text();
  let event;
  try {
    event = await receiver.receive(body, req.headers.get("authorization") ?? undefined);
  } catch {
    return new NextResponse("Invalid signature", { status: 401 });
  }

  const kind = event.event;
  const mapped = kind === "participant_joined" ? "join" : kind === "participant_left" ? "leave" : kind === "room_finished" ? "room_finished" : null;
  if (!mapped) return NextResponse.json({ ok: true });

  const room = event.room?.name;
  const identity = event.participant?.identity;
  if (!room) return NextResponse.json({ ok: true });
  if (mapped !== "room_finished" && !(identity && IDENTITY.test(identity))) return NextResponse.json({ ok: true });

  const admin = createAdminClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await admin.rpc("live_webhook_event", {
    p_room: room,
    p_user: mapped === "room_finished" ? null : identity,
    p_event: mapped,
    p_at: new Date().toISOString(),
  });
  if (error) {
    console.error("[livekit-webhook] rpc failed", { code: error.code });
    return new NextResponse("Error", { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
