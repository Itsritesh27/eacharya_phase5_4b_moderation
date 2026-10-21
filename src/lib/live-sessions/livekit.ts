import { AccessToken, RoomServiceClient } from "livekit-server-sdk";
import type { JoinRole } from "./rules";

/** Server-only LiveKit settings. The API secret never reaches the browser. */
export function getLiveKitEnv() {
  const url = (process.env.LIVEKIT_URL ?? process.env.NEXT_PUBLIC_LIVEKIT_URL ?? "").trim();
  const apiKey = (process.env.LIVEKIT_API_KEY ?? "").trim();
  const apiSecret = (process.env.LIVEKIT_API_SECRET ?? "").trim();
  if (!url || !apiKey || !apiSecret) return null;
  return { url, apiKey, apiSecret };
}

export function isLiveKitConfigured(): boolean {
  return getLiveKitEnv() !== null;
}

/**
 * Short-lived join token. The identity is the user's id so attendance webhooks map back to a student.
 * Hosts are room admins (can mute and remove people); students can speak and send chat but cannot administer.
 */
export async function createJoinToken(opts: { room: string; userId: string; name: string; role: JoinRole }): Promise<{ token: string; url: string } | null> {
  const env = getLiveKitEnv();
  if (!env) return null;
  const at = new AccessToken(env.apiKey, env.apiSecret, {
    identity: opts.userId,
    name: opts.name || "Participant",
    ttl: "3h",
  });
  at.addGrant({
    room: opts.room,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
    roomAdmin: opts.role === "host",
  });
  return { token: await at.toJwt(), url: env.url };
}

/** Best effort: disconnects everyone when the teacher ends the class. */
export async function closeRoom(room: string): Promise<void> {
  const env = getLiveKitEnv();
  if (!env) return;
  try {
    const client = new RoomServiceClient(env.url.replace(/^wss:/, "https:").replace(/^ws:/, "http:"), env.apiKey, env.apiSecret);
    await client.deleteRoom(room);
  } catch (e) {
    console.error("[live] closeRoom failed", (e as Error)?.message);
  }
}
