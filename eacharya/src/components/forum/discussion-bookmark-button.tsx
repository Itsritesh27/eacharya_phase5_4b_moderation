"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Bookmark, BookmarkCheck } from "lucide-react";
import { setDiscussionBookmarkAction } from "@/lib/forum/actions";
import { cn } from "@/lib/utils/cn";

interface Props {
  discussionId: string;
  initial: boolean;
  showLabel?: boolean;
  /** Refresh the server-rendered page after a change (used on the bookmarks list so a removed row disappears). */
  refreshOnChange?: boolean;
  className?: string;
}

/** Private bookmark toggle for a forum discussion. Same safety rules as LikeButton: one request at a time, rollback on failure. */
export function DiscussionBookmarkButton({ discussionId, initial, showLabel = false, refreshOnChange = false, className }: Props) {
  const router = useRouter();
  const [bookmarked, setBookmarked] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  async function toggle() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    const next = !bookmarked;
    setBookmarked(next);
    try {
      const res = await setDiscussionBookmarkAction({ discussionId, bookmarked: next });
      if (res.ok) {
        setBookmarked(res.bookmarked);
        if (refreshOnChange) router.refresh();
      } else {
        setBookmarked(!next); setError(res.error);
      }
    } catch {
      setBookmarked(!next); setError("We could not reach the server. Please try again.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  const Icon = bookmarked ? BookmarkCheck : Bookmark;
  const label = bookmarked ? "Remove bookmark" : "Bookmark this discussion";
  return (
    <span className={cn("inline-flex flex-col items-start", className)}>
      <button
        type="button"
        onClick={toggle}
        aria-pressed={bookmarked}
        aria-busy={busy || undefined}
        aria-label={label}
        title={label}
        className={cn(
          "inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-sm font-semibold transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 aria-busy:opacity-70",
          bookmarked ? "border-brand-300 bg-brand-50 text-brand-800" : "border-sage-300 bg-white text-forest-800 hover:bg-sage-50",
        )}
      >
        <Icon className="h-4 w-4" aria-hidden />
        {showLabel && <span>{bookmarked ? "Bookmarked" : "Bookmark"}</span>}
      </button>
      {error && <span role="alert" className="mt-1 text-xs text-danger-600">{error}</span>}
    </span>
  );
}
