"use client";

import { useRef, useState } from "react";
import { Heart } from "lucide-react";
import { setDiscussionLikeAction, setReplyLikeAction, type LikeResult } from "@/lib/forum/actions";
import { cn } from "@/lib/utils/cn";

interface Props {
  kind: "discussion" | "reply";
  id: string;
  initialCount: number;
  initialLiked: boolean;
  className?: string;
}

/**
 * Like toggle. Optimistic, but rolled back if the server says no, and clicks are ignored while a request is in
 * flight, so rapid clicking can only ever send one request at a time. The final count is the one the database
 * reports, not a local guess. The user id is never sent: the server reads it from the session.
 */
export function LikeButton({ kind, id, initialCount, initialLiked, className }: Props) {
  const [liked, setLiked] = useState(initialLiked);
  const [count, setCount] = useState(initialCount);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  async function toggle() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    const prev = { liked, count };
    const next = !liked;
    setLiked(next);
    setCount(Math.max(0, count + (next ? 1 : -1)));
    try {
      const res: LikeResult =
        kind === "discussion"
          ? await setDiscussionLikeAction({ discussionId: id, liked: next })
          : await setReplyLikeAction({ replyId: id, liked: next });
      if (res.ok) {
        setLiked(res.liked);
        if (res.likeCount !== null) setCount(res.likeCount);
      } else {
        setLiked(prev.liked); setCount(prev.count); setError(res.error);
      }
    } catch {
      setLiked(prev.liked); setCount(prev.count); setError("We could not reach the server. Please try again.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  const noun = kind === "discussion" ? "discussion" : "reply";
  return (
    <span className={cn("inline-flex flex-col items-start", className)}>
      <button
        type="button"
        onClick={toggle}
        aria-pressed={liked}
        aria-busy={busy || undefined}
        aria-label={`${liked ? "Unlike" : "Like"} this ${noun}. ${count} ${count === 1 ? "like" : "likes"}`}
        className={cn(
          "inline-flex h-10 min-w-[2.75rem] items-center gap-1.5 rounded-xl border px-3 text-sm font-semibold transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 aria-busy:opacity-70",
          liked ? "border-brand-300 bg-brand-50 text-brand-800" : "border-sage-300 bg-white text-forest-800 hover:bg-sage-50",
        )}
      >
        <Heart className={cn("h-4 w-4", liked && "fill-current")} aria-hidden />
        <span aria-hidden>{count}</span>
      </button>
      {error && <span role="alert" className="mt-1 text-xs text-danger-600">{error}</span>}
    </span>
  );
}
