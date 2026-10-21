"use client";

import "@livekit/components-styles";
import { LiveKitRoom, VideoConference, RoomAudioRenderer } from "@livekit/components-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { buttonClasses } from "@/components/ui/button";
import { leaveLiveSessionAction } from "@/lib/live-sessions/actions";

type Join = { token: string; url: string; role: "host" | "participant" };

/** Fetches a short-lived token from our server, then joins the LiveKit room inside the page. */
export function LiveRoom({ sessionId, backHref }: { sessionId: string; backHref: string }) {
  const router = useRouter();
  const [join, setJoin] = useState<Join | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // In development React mounts the room twice, which briefly disconnects the first connection.
  // Only treat a disconnect as real if we are still not connected a moment later.
  const connectedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/live-sessions/${sessionId}/token`, { method: "POST", cache: "no-store" });
        const body = (await res.json().catch(() => ({}))) as Partial<Join> & { error?: string };
        if (cancelled) return;
        if (!res.ok || !body.token || !body.url) { setError(body.error ?? "Could not join this class."); return; }
        setJoin({ token: body.token, url: body.url, role: body.role === "host" ? "host" : "participant" });
      } catch {
        if (!cancelled) setError("Network problem. Check your connection and try again.");
      }
    })();
    return () => { cancelled = true; };
  }, [sessionId]);

  // Closing the tab or browser never reaches onDisconnected; tell the server so time in class is still counted.
  useEffect(() => {
    if (join?.role !== "participant") return;
    const onHide = () => { try { navigator.sendBeacon(`/api/live-sessions/${sessionId}/leave`); } catch { /* best effort */ } };
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, [join?.role, sessionId]);

  if (error) {
    return (
      <div className="mx-auto max-w-md space-y-4 p-6">
        <Alert tone="error">{error}</Alert>
        <a href={backHref} className={buttonClasses("secondary", "md")}>Back to live classes</a>
      </div>
    );
  }
  if (!join) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-forest-600">
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> Joining class…
      </div>
    );
  }

  return (
    <div className="relative h-full">
    {notice && (
      <div role="status" className="absolute inset-x-0 top-0 z-50 flex items-start justify-between gap-3 bg-amber-100 px-4 py-2 text-sm text-amber-900">
        <span>{notice}</span>
        <button type="button" onClick={() => setNotice(null)} className="font-semibold underline">Dismiss</button>
      </div>
    )}
    <LiveKitRoom
      data-lk-theme="default"
      serverUrl={join.url}
      token={join.token}
      connect
      // Students enter with mic and camera off (35 people at once); they can switch them on from the controls.
      audio={join.role === "host"}
      video={join.role === "host"}
      onConnected={() => { connectedRef.current = true; }}
      onDisconnected={() => {
        connectedRef.current = false;
        window.setTimeout(() => {
          if (connectedRef.current) return;
          if (join.role === "participant") void leaveLiveSessionAction(sessionId);
          router.push(backHref);
          router.refresh();
        }, 1500);
      }}
      onError={(e) => {
        // A connection we closed ourselves (e.g. the development double-mount) is not a problem to show.
        const msg = e.message ?? "";
        if (/client initiated disconnect/i.test(msg)) return;
        console.error("[live] room error", e);
        // Camera/mic problems must not throw the person out of the class.
        if (/permission|notallowed|notfound|device|camera|microphone|getusermedia/i.test(`${e.name} ${msg}`)) {
          setNotice("Camera or microphone is blocked. Allow them from the lock icon in the address bar, then refresh. You can still watch and listen.");
          return;
        }
        setError(msg || "Connection problem.");
      }}
      onMediaDeviceFailure={() => {
        setNotice("Camera or microphone is blocked. Allow them from the lock icon in the address bar, then refresh. You can still watch and listen.");
      }}
      style={{ height: "100%" }}
    >
      <VideoConference />
      <RoomAudioRenderer />
    </LiveKitRoom>
    </div>
  );
}
