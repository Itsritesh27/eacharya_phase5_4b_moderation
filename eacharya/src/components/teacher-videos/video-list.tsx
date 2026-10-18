"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Pencil, Trash2, X } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { removeVideoAction, renameVideoAction } from "@/lib/teacher-videos/actions";
import { MAX_TITLE, youtubeThumbnail } from "@/lib/teacher-videos/links";
import type { ChapterVideo } from "@/lib/teacher-videos/data";

export function VideoList({
  unitId,
  videos,
  locked,
}: {
  unitId: string;
  videos: ChapterVideo[];
  /** True when the course is published: lessons cannot be edited by teachers then. */
  locked: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function saveTitle(lessonId: string) {
    setError(null);
    start(async () => {
      const res = await renameVideoAction({ lessonId, unitId, title: draft });
      if (!res.ok) return setError(res.error);
      setEditing(null);
      router.refresh();
    });
  }

  function remove(v: ChapterVideo) {
    if (!window.confirm(`Remove "${v.title}"? Students' saved progress on this video is removed too.`)) return;
    setError(null);
    start(async () => {
      const res = await removeVideoAction({ lessonId: v.lessonId, unitId });
      if (!res.ok) return setError(res.error);
      router.refresh();
    });
  }

  if (videos.length === 0) {
    return <p className="text-sm text-forest-600">No videos in this chapter yet. Paste links above to add some.</p>;
  }

  return (
    <div className="space-y-3">
      {error ? <Alert tone="error">{error}</Alert> : null}
      <ol className="divide-y divide-sage-100 rounded-card border border-sage-200 bg-white shadow-card">
        {videos.map((v, i) => (
          <li key={v.lessonId} className="flex items-center gap-3 p-3">
            <span className="w-6 shrink-0 text-center text-sm font-semibold text-forest-600">{i + 1}</span>
            <div className="h-12 w-20 shrink-0 overflow-hidden rounded-lg bg-sage-100">
              {v.youtubeId ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={youtubeThumbnail(v.youtubeId)} alt="" className="h-full w-full object-cover" />
              ) : null}
            </div>
            <div className="min-w-0 flex-1">
              {editing === v.lessonId ? (
                <Input
                  value={draft}
                  maxLength={MAX_TITLE}
                  onChange={(e) => setDraft(e.target.value)}
                  aria-label="Video title"
                  autoFocus
                />
              ) : (
                <p className="truncate font-medium">{v.title}</p>
              )}
              <p className="text-xs text-forest-600">
                {v.videoUrl ? (v.youtubeId ? "YouTube" : "Video file") : "No video link"} ·{" "}
                {v.isPublished ? "Visible to students" : "Hidden"}
              </p>
            </div>
            {!locked ? (
              <div className="flex shrink-0 gap-1">
                {editing === v.lessonId ? (
                  <>
                    <Button size="sm" onClick={() => saveTitle(v.lessonId)} disabled={pending} aria-label="Save title">
                      <Check className="h-4 w-4" aria-hidden />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setEditing(null)} aria-label="Cancel">
                      <X className="h-4 w-4" aria-hidden />
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditing(v.lessonId);
                        setDraft(v.title);
                      }}
                      aria-label={`Rename ${v.title}`}
                    >
                      <Pencil className="h-4 w-4" aria-hidden />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => remove(v)} disabled={pending} aria-label={`Remove ${v.title}`}>
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </Button>
                  </>
                )}
              </div>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}
