"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, FileText, Loader2, Pencil, Trash2, Upload, X } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  addLessonResourcesAction,
  removeLessonResourceAction,
  removeVideoAction,
  renameVideoAction,
} from "@/lib/teacher-videos/actions";
import { discardResourceUpload, uploadResourceFile } from "@/lib/teacher-videos/upload-client";
import {
  MAX_RESOURCES_PER_LESSON,
  RESOURCE_ACCEPT,
  checkResourceFile,
  resourceTitleFromName,
} from "@/lib/teacher-videos/resource-files";
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
  const [busyLesson, setBusyLesson] = useState<string | null>(null);

  /** Upload study material(s) for an existing lesson, then save them so students see them at once. */
  async function addMaterials(lessonId: string, files: FileList | null, current: number) {
    if (!files || files.length === 0) return;
    setError(null);
    const picked = Array.from(files);
    if (current + picked.length > MAX_RESOURCES_PER_LESSON) {
      return setError(`A video can have up to ${MAX_RESOURCES_PER_LESSON} study materials.`);
    }
    for (const f of picked) {
      const problem = checkResourceFile(f);
      if (problem) return setError(problem);
    }
    setBusyLesson(lessonId);
    const done: { path: string; title: string }[] = [];
    try {
      for (const f of picked) {
        const { path } = await uploadResourceFile(f, unitId, () => undefined).promise;
        done.push({ path, title: resourceTitleFromName(f.name) });
      }
      const res = await addLessonResourcesAction({ unitId, lessonId, items: done });
      if (!res.ok) throw new Error(res.error);
      router.refresh();
    } catch (e) {
      await Promise.all(done.map((d) => discardResourceUpload(d.path)));
      setError(e instanceof Error ? e.message : "Could not upload the file.");
    } finally {
      setBusyLesson(null);
    }
  }

  function removeMaterial(resourceId: string, title: string) {
    if (!window.confirm(`Remove "${title}" from this video?`)) return;
    setError(null);
    start(async () => {
      const res = await removeLessonResourceAction({ resourceId, unitId });
      if (!res.ok) return setError(res.error);
      router.refresh();
    });
  }

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
          <li key={v.lessonId} className="p-3">
            <div className="flex items-center gap-3">
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
            </div>
            <div className="mt-2 space-y-1 pl-9 text-xs">
              {v.resources.map((r) => (
                <div key={r.id} className="flex items-center gap-2 text-forest-700">
                  <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{r.title}</span>
                  {!locked ? (
                    <button
                      type="button"
                      onClick={() => removeMaterial(r.id, r.title)}
                      disabled={pending}
                      aria-label={`Remove ${r.title}`}
                      className="text-forest-600 hover:text-forest-900"
                    >
                      <X className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  ) : null}
                </div>
              ))}
              {!locked && v.resources.length < MAX_RESOURCES_PER_LESSON ? (
                <label className="inline-flex cursor-pointer items-center gap-1.5 font-semibold text-brand-700 hover:underline">
                  {busyLesson === v.lessonId ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Uploading…
                    </>
                  ) : (
                    <>
                      <Upload className="h-3.5 w-3.5" aria-hidden /> Add study material (PDF, slides, images)
                    </>
                  )}
                  <input
                    type="file"
                    accept={RESOURCE_ACCEPT}
                    multiple
                    disabled={busyLesson !== null}
                    className="sr-only"
                    onChange={(e) => {
                      void addMaterials(v.lessonId, e.target.files, v.resources.length);
                      e.target.value = "";
                    }}
                  />
                </label>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
