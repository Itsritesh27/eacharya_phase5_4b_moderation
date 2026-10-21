"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Bookmark, BookmarkCheck } from "lucide-react";
import { setBookmarkAction } from "@/lib/learning/actions";
import { cn } from "@/lib/utils/cn";

export function BookmarkButton({
  lessonId,
  resourceId,
  initial,
  showLabel = false,
  className,
}: {
  lessonId?: string;
  resourceId?: string;
  initial: boolean;
  showLabel?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [bookmarked, setBookmarked] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle() {
    const next = !bookmarked;
    setBookmarked(next); // optimistic
    setError(null);
    startTransition(async () => {
      const result = await setBookmarkAction({ lessonId, resourceId, bookmarked: next });
      if (!result.ok) {
        setBookmarked(!next);
        setError(result.error);
      } else {
        router.refresh();
      }
    });
  }

  const Icon = bookmarked ? BookmarkCheck : Bookmark;
  const label = bookmarked ? "Remove bookmark" : "Add bookmark";

  return (
    <span className={cn("inline-flex flex-col items-start", className)}>
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        aria-pressed={bookmarked}
        aria-label={label}
        title={label}
        className={cn(
          "inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-sm font-medium transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:opacity-60",
          bookmarked
            ? "border-brand-300 bg-brand-50 text-brand-800"
            : "border-sage-300 bg-white text-forest-800 hover:bg-sage-50",
        )}
      >
        <Icon className="h-4 w-4" aria-hidden />
        {showLabel && <span>{bookmarked ? "Bookmarked" : "Bookmark"}</span>}
      </button>
      {error && (
        <span role="alert" className="mt-1 text-xs text-danger-600">
          {error}
        </span>
      )}
    </span>
  );
}
