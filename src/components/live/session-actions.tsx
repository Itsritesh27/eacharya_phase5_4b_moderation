"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { cancelLiveSessionAction, endLiveSessionAction } from "@/lib/live-sessions/actions";

/** Cancel (before it starts) or end (after it started) a class. Both ask first. */
export function SessionActions({ id, status }: { id: string; status: "scheduled" | "live" }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const isLive = status === "live";

  function run() {
    const msg = isLive ? "End this class for everyone now?" : "Cancel this class? Students will no longer be able to join.";
    if (!window.confirm(msg)) return;
    setError(null);
    startTransition(async () => {
      const r = isLive ? await endLiveSessionAction(id) : await cancelLiveSessionAction(id);
      if (r.ok) router.refresh(); else setError(r.error);
    });
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button variant="danger" size="sm" onClick={run} disabled={pending}>
        {pending ? "Working…" : isLive ? "End class" : "Cancel"}
      </Button>
      {error && <span role="alert" className="text-xs text-danger-600">{error}</span>}
    </span>
  );
}
