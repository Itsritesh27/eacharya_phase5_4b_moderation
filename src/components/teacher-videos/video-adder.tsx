"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Download, FileText, Film, Loader2, Upload, X } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/assessments/form-controls";
import { addVideosAction, previewVideosAction } from "@/lib/teacher-videos/actions";
import { MAX_BATCH, MAX_TITLE, extractVideoLinks, titleFromFilename, youtubeThumbnail } from "@/lib/teacher-videos/links";
import {
  discardResourceUpload,
  discardUpload,
  uploadLessonFile,
  uploadResourceFile,
  type UploadHandle,
} from "@/lib/teacher-videos/upload-client";
import {
  MAX_RESOURCES_PER_LESSON,
  RESOURCE_ACCEPT,
  checkResourceFile,
  resourceTitleFromName,
} from "@/lib/teacher-videos/resource-files";
import { MAX_DOWNLOADS_PER_VIDEO, QUALITY_OPTIONS, checkUploadFile } from "@/lib/teacher-videos/uploads";

/** A file the teacher uploaded for students to download. */
interface Dl {
  id: string;
  name: string;
  label: string;
  height: number;
  progress: number;
  status: "uploading" | "done" | "error";
  url: string | null;
  error: string | null;
}

/** A study material (PDF, slides, image) the teacher attached to a video. */
interface Res {
  id: string;
  name: string;
  title: string;
  progress: number;
  status: "uploading" | "done" | "error";
  path: string | null;
  error: string | null;
}

let counter = 0;
const nextId = () => `u${Date.now().toString(36)}${counter++}`;

interface Row {
  key: string;
  /** "upload" rows are video files uploaded from the computer; their `url` is filled in when done. */
  origin: "link" | "upload";
  uploadStatus?: "uploading" | "done" | "error";
  progress?: number;
  uploadError?: string | null;
  downloads: Dl[];
  resources: Res[];
  url: string;
  kind: "youtube" | "direct" | "hls";
  videoId: string | null;
  title: string;
  author: string | null;
  state: "loading" | "found" | "manual";
}

export function VideoAdder({ unitId, existingKeys }: { unitId: string; existingKeys: string[] }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [publish, setPublish] = useState(true);
  const [saving, startSaving] = useTransition();
  const [allowDownload, setAllowDownload] = useState(true);
  const rowsRef = useRef<Row[]>([]);
  rowsRef.current = rows;
  const handles = useRef(new Map<string, UploadHandle>());

  // Whenever links are pasted, look up their titles automatically (after a short pause).
  useEffect(() => {
    if (text.trim() === "") return;
    const timer = setTimeout(async () => {
      const { links, rejected, duplicates } = extractVideoLinks(text);
      const have = new Set([...existingKeys, ...rowsRef.current.map((r) => r.key)]);
      const fresh = links.filter((l) => !have.has(l.key));
      const alreadyThere = links.length - fresh.length + duplicates;
      const room = MAX_BATCH - rowsRef.current.length;
      const take = fresh.slice(0, Math.max(room, 0));

      const parts: string[] = [];
      if (alreadyThere > 0) parts.push(`${alreadyThere} already added or repeated, skipped`);
      if (rejected.length > 0) parts.push(`${rejected.length} not a supported video link, ignored`);
      if (fresh.length > take.length) parts.push(`only ${MAX_BATCH} videos can be added at a time`);
      setNotice(parts.length ? parts.join(". ") + "." : null);
      setError(null);
      setSuccess(null);
      setText("");
      if (take.length === 0) return;

      setRows((prev) => [
        ...prev,
        ...take.map<Row>((l) => ({
          key: l.key,
          origin: "link",
          downloads: [],
          resources: [],
          url: l.url,
          kind: l.source.kind,
          videoId: l.source.kind === "youtube" ? l.source.videoId : null,
          title: "",
          author: null,
          state: "loading",
        })),
      ]);

      const res = await previewVideosAction(take.map((l) => l.url));
      const byUrl = new Map(res.ok ? res.previews.map((p) => [p.url, p]) : []);
      setRows((prev) =>
        prev.map((r) => {
          if (r.state !== "loading") return r;
          const p = byUrl.get(r.url);
          const title = p?.title ?? p?.fallbackTitle ?? "";
          return { ...r, title, author: p?.author ?? null, state: p?.title ? "found" : "manual" };
        }),
      );
      if (!res.ok) setError(res.error);
    }, 500);
    return () => clearTimeout(timer);
  }, [text, existingKeys]);

  function update(key: string, patch: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }
  function remove(key: string) {
    const row = rowsRef.current.find((r) => r.key === key);
    if (row) {
      handles.current.get(key)?.abort();
      if (row.origin === "upload" && row.url) void discardUpload(row.url);
      for (const d of row.downloads) {
        handles.current.get(d.id)?.abort();
        if (d.url) void discardUpload(d.url);
      }
      for (const f of row.resources) {
        handles.current.get(f.id)?.abort();
        if (f.path) void discardResourceUpload(f.path);
      }
    }
    setRows((prev) => prev.filter((r) => r.key !== key));
  }
  function move(i: number, dir: -1 | 1) {
    setRows((prev) => {
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = prev.slice();
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });
  }

  function patchDl(rowKey: string, dlId: string, patch: Partial<Dl>) {
    setRows((prev) =>
      prev.map((r) =>
        r.key === rowKey ? { ...r, downloads: r.downloads.map((d) => (d.id === dlId ? { ...d, ...patch } : d)) } : r,
      ),
    );
  }

  /** Teacher picked video file(s) to upload AS the lesson video. */
  function uploadAsVideo(files: FileList | null) {
    if (!files) return;
    setError(null);
    setSuccess(null);
    const picked = Array.from(files).slice(0, Math.max(MAX_BATCH - rowsRef.current.length, 0));
    for (const file of picked) {
      const problem = checkUploadFile(file);
      if (problem) {
        setError(problem);
        continue;
      }
      const key = `up:${nextId()}`;
      setRows((prev) => [
        ...prev,
        {
          key,
          origin: "upload",
          uploadStatus: "uploading",
          progress: 0,
          uploadError: null,
          downloads: [],
          resources: [],
          url: "",
          kind: "direct",
          videoId: null,
          title: titleFromFilename(`https://x/${encodeURIComponent(file.name)}`),
          author: null,
          state: "manual",
        },
      ]);
      const h = uploadLessonFile(file, unitId, (pct) => update(key, { progress: pct }));
      handles.current.set(key, h);
      h.promise
        .then(({ url }) => update(key, { url, uploadStatus: "done", progress: 100 }))
        .catch((e: Error) => update(key, { uploadStatus: "error", uploadError: e.message }))
        .finally(() => handles.current.delete(key));
    }
  }

  /** Teacher attached a downloadable file to a (YouTube) row. */
  function attachDownload(rowKey: string, files: FileList | null, label: string, height: number) {
    const file = files?.[0];
    if (!file) return;
    const problem = checkUploadFile(file);
    if (problem) return setError(problem);
    setError(null);
    const id = nextId();
    const dl: Dl = { id, name: file.name, label, height, progress: 0, status: "uploading", url: null, error: null };
    setRows((prev) => prev.map((r) => (r.key === rowKey ? { ...r, downloads: [...r.downloads, dl] } : r)));
    const h = uploadLessonFile(file, unitId, (pct) => patchDl(rowKey, id, { progress: pct }));
    handles.current.set(id, h);
    h.promise
      .then(({ url }) => patchDl(rowKey, id, { status: "done", url, progress: 100 }))
      .catch((e: Error) => patchDl(rowKey, id, { status: "error", error: e.message }))
      .finally(() => handles.current.delete(id));
  }

  function patchRes(rowKey: string, id: string, patch: Partial<Res>) {
    setRows((prev) =>
      prev.map((r) =>
        r.key === rowKey ? { ...r, resources: r.resources.map((f) => (f.id === id ? { ...f, ...patch } : f)) } : r,
      ),
    );
  }

  /** Teacher attached study material(s) to a row. */
  function attachResources(rowKey: string, files: FileList | null) {
    if (!files) return;
    const row = rowsRef.current.find((r) => r.key === rowKey);
    let room = MAX_RESOURCES_PER_LESSON - (row?.resources.length ?? 0);
    setError(null);
    for (const file of Array.from(files)) {
      if (room <= 0) {
        setError(`A video can have up to ${MAX_RESOURCES_PER_LESSON} study materials.`);
        break;
      }
      const problem = checkResourceFile(file);
      if (problem) {
        setError(problem);
        continue;
      }
      room -= 1;
      const id = nextId();
      const item: Res = {
        id,
        name: file.name,
        title: resourceTitleFromName(file.name),
        progress: 0,
        status: "uploading",
        path: null,
        error: null,
      };
      setRows((prev) => prev.map((r) => (r.key === rowKey ? { ...r, resources: [...r.resources, item] } : r)));
      const h = uploadResourceFile(file, unitId, (pct) => patchRes(rowKey, id, { progress: pct }));
      handles.current.set(id, h);
      h.promise
        .then(({ path }) => patchRes(rowKey, id, { status: "done", path, progress: 100 }))
        .catch((e: Error) => patchRes(rowKey, id, { status: "error", error: e.message }))
        .finally(() => handles.current.delete(id));
    }
  }

  function removeRes(rowKey: string, f: Res) {
    handles.current.get(f.id)?.abort();
    if (f.path) void discardResourceUpload(f.path);
    setRows((prev) =>
      prev.map((r) => (r.key === rowKey ? { ...r, resources: r.resources.filter((x) => x.id !== f.id) } : r)),
    );
  }

  function removeDl(rowKey: string, dl: Dl) {
    handles.current.get(dl.id)?.abort();
    if (dl.url) void discardUpload(dl.url);
    setRows((prev) =>
      prev.map((r) => (r.key === rowKey ? { ...r, downloads: r.downloads.filter((d) => d.id !== dl.id) } : r)),
    );
  }

  const uploading = rows.some(
    (r) =>
      r.uploadStatus === "uploading" ||
      r.downloads.some((d) => d.status === "uploading") ||
      r.resources.some((f) => f.status === "uploading"),
  );
  const failed = rows.some(
    (r) =>
      r.uploadStatus === "error" ||
      r.downloads.some((d) => d.status === "error") ||
      r.resources.some((f) => f.status === "error"),
  );
  const loading = rows.some((r) => r.state === "loading") || uploading;
  const missingTitle = rows.some((r) => r.state !== "loading" && r.title.trim() === "");
  const canSave = rows.length > 0 && !loading && !missingTitle && !failed && !saving;

  function save() {
    setError(null);
    setSuccess(null);
    startSaving(async () => {
      const res = await addVideosAction({
        unitId,
        publish,
        allowDownload,
        items: rows.map((r) => ({
          url: r.url,
          title: r.title,
          downloads: r.downloads
            .filter((d) => d.status === "done" && d.url)
            .map((d) => ({ url: d.url as string, label: d.label, height: d.height })),
          resources: r.resources
            .filter((f) => f.status === "done" && f.path)
            .map((f) => ({ path: f.path as string, title: f.title })),
        })),
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setRows([]);
      setNotice(null);
      setSuccess(
        res.added === 0
          ? "Nothing new to add: those videos are already in this chapter."
          : `Added ${res.added} video${res.added === 1 ? "" : "s"} to this chapter.` +
              (res.skipped > 0 ? ` ${res.skipped} already there, skipped.` : "") +
              (res.resourcesFailed ? ` ${res.resourcesFailed} study material(s) could not be attached; add them from the list below.` : ""),
      );
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="video-links" className="mb-1.5 block text-sm font-medium text-forest-800">
          Paste video links
        </label>
        <Textarea
          id="video-links"
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={"https://www.youtube.com/watch?v=…\nhttps://youtu.be/…"}
          aria-describedby="video-links-hint"
        />
        <p id="video-links-hint" className="mt-1.5 text-xs text-forest-600">
          Paste one link or many (one per line). Titles are fetched from YouTube automatically; you can edit them
          before saving. Direct .mp4 / .webm links work too, but you type their titles.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-sage-300 bg-white px-4 py-2 text-sm font-semibold text-forest-900 hover:bg-sage-50">
          <Upload className="h-4 w-4" aria-hidden /> Upload video file from this computer
          <input
            type="file"
            accept=".mp4,.webm,.ogv,video/mp4,video/webm,video/ogg"
            multiple
            className="sr-only"
            onChange={(e) => {
              uploadAsVideo(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
        <span className="text-xs text-forest-600">.mp4 / .webm, up to 500 MB each. Uploaded straight to your storage.</span>
      </div>

      {notice ? <p className="text-sm text-forest-700">{notice}</p> : null}
      {error ? <Alert tone="error">{error}</Alert> : null}
      {success ? <Alert tone="success">{success}</Alert> : null}

      {rows.length > 0 ? (
        <>
          <ul className="divide-y divide-sage-100 rounded-card border border-sage-200 bg-white shadow-card">
            {rows.map((r, i) => (
              <li key={r.key} className="flex items-start gap-3 p-3">
                <div className="h-16 w-28 shrink-0 overflow-hidden rounded-lg bg-sage-100">
                  {r.videoId ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={youtubeThumbnail(r.videoId)} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-forest-500">
                      <Film className="h-6 w-6" aria-hidden />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  {r.state === "loading" ? (
                    <p className="flex items-center gap-2 text-sm text-forest-600">
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Fetching title…
                    </p>
                  ) : (
                    <>
                      <Input
                        value={r.title}
                        maxLength={MAX_TITLE}
                        onChange={(e) => update(r.key, { title: e.target.value })}
                        aria-label={`Title for video ${i + 1}`}
                        aria-invalid={r.title.trim() === ""}
                      />
                      {r.origin === "upload" ? (
                        <p className={`mt-1 text-xs ${r.uploadStatus === "error" ? "text-danger-700" : "text-forest-600"}`}>
                          {r.uploadStatus === "uploading"
                            ? `Uploading… ${r.progress ?? 0}%`
                            : r.uploadStatus === "error"
                              ? (r.uploadError ?? "Upload failed.")
                              : "Uploaded · students can watch and download this file"}
                        </p>
                      ) : null}
                      <p className={`mt-1 truncate text-xs text-forest-600 ${r.origin === "upload" ? "hidden" : ""}`}>
                        {r.state === "found"
                          ? `From YouTube${r.author ? ` · ${r.author}` : ""}`
                          : r.kind === "youtube"
                            ? "Could not fetch the title (private, removed, or YouTube unreachable). Please type one."
                            : "Please check the title."}
                      </p>
                      <MaterialsPanel
                        row={r}
                        onAttach={(files) => attachResources(r.key, files)}
                        onRemove={(f) => removeRes(r.key, f)}
                        onTitle={(id, title) => patchRes(r.key, id, { title })}
                      />
                      {r.origin === "link" ? (
                        <DownloadPanel
                          row={r}
                          onAttach={(files, label, height) => attachDownload(r.key, files, label, height)}
                          onRemove={(d) => removeDl(r.key, d)}
                        />
                      ) : null}
                    </>
                  )}
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button variant="ghost" size="sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">
                    <ArrowUp className="h-4 w-4" aria-hidden />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => move(i, 1)}
                    disabled={i === rows.length - 1}
                    aria-label="Move down"
                  >
                    <ArrowDown className="h-4 w-4" aria-hidden />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => remove(r.key)} aria-label="Remove from list">
                    <X className="h-4 w-4" aria-hidden />
                  </Button>
                </div>
              </li>
            ))}
          </ul>

          <label className="flex items-center gap-2 text-sm text-forest-800">
            <input
              type="checkbox"
              checked={allowDownload}
              onChange={(e) => setAllowDownload(e.target.checked)}
              className="h-4 w-4 rounded border-sage-300 text-brand-600"
            />
            Let students download the video files
          </label>

          <label className="flex items-center gap-2 text-sm text-forest-800">
            <input
              type="checkbox"
              checked={publish}
              onChange={(e) => setPublish(e.target.checked)}
              className="h-4 w-4 rounded border-sage-300 text-brand-600"
            />
            Make these lessons visible to students (they still only appear once the course is published)
          </label>

          <div className="flex items-center gap-3">
            <Button onClick={save} disabled={!canSave}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              Add {rows.length} video{rows.length === 1 ? "" : "s"} to this chapter
            </Button>
            <Button variant="ghost" onClick={() => setRows([])} disabled={saving}>
              Clear list
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}

function DownloadPanel({
  row,
  onAttach,
  onRemove,
}: {
  row: Row;
  onAttach: (files: FileList | null, label: string, height: number) => void;
  onRemove: (d: Dl) => void;
}) {
  const [q, setQ] = useState<string>("Original");
  const opt = QUALITY_OPTIONS.find((o) => o.label === q) ?? QUALITY_OPTIONS[0];
  return (
    <div className="mt-2 space-y-1.5 rounded-lg bg-sage-50 p-2">
      {row.downloads.map((d) => (
        <div key={d.id} className="flex items-center gap-2 text-xs">
          <Download className="h-3.5 w-3.5 shrink-0 text-forest-600" aria-hidden />
          <span className="min-w-0 flex-1 truncate">
            {d.label} · {d.name}
            {d.status === "uploading" ? ` · uploading ${d.progress}%` : null}
            {d.status === "error" ? <span className="text-danger-700"> · {d.error}</span> : null}
            {d.status === "done" ? " · ready" : null}
          </span>
          <button type="button" onClick={() => onRemove(d)} aria-label={`Remove ${d.name}`} className="text-forest-600 hover:text-forest-900">
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      ))}
      {row.downloads.length < MAX_DOWNLOADS_PER_VIDEO ? (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <select
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Quality of the file to upload"
            className="rounded-md border border-sage-300 bg-white px-1.5 py-1"
          >
            {QUALITY_OPTIONS.map((o) => (
              <option key={o.label} value={o.label}>
                {o.label}
              </option>
            ))}
          </select>
          <label className="inline-flex cursor-pointer items-center gap-1.5 font-semibold text-brand-700 hover:underline">
            <Upload className="h-3.5 w-3.5" aria-hidden /> Upload file for students to download
            <input
              type="file"
              accept=".mp4,.webm,.ogv,video/mp4,video/webm,video/ogg"
              className="sr-only"
              onChange={(e) => {
                onAttach(e.target.files, opt.label, opt.height);
                e.target.value = "";
              }}
            />
          </label>
        </div>
      ) : null}
    </div>
  );
}

function MaterialsPanel({
  row,
  onAttach,
  onRemove,
  onTitle,
}: {
  row: Row;
  onAttach: (files: FileList | null) => void;
  onRemove: (f: Res) => void;
  onTitle: (id: string, title: string) => void;
}) {
  return (
    <div className="mt-2 space-y-1.5 rounded-lg bg-sage-50 p-2">
      {row.resources.map((f) => (
        <div key={f.id} className="flex items-center gap-2 text-xs">
          <FileText className="h-3.5 w-3.5 shrink-0 text-forest-600" aria-hidden />
          <input
            value={f.title}
            maxLength={200}
            onChange={(e) => onTitle(f.id, e.target.value)}
            aria-label={`Title for ${f.name}`}
            className="min-w-0 flex-1 rounded-md border border-sage-300 bg-white px-1.5 py-1"
          />
          <span className="shrink-0 text-forest-600">
            {f.status === "uploading" ? `${f.progress}%` : null}
            {f.status === "error" ? <span className="text-danger-700">{f.error}</span> : null}
            {f.status === "done" ? "ready" : null}
          </span>
          <button type="button" onClick={() => onRemove(f)} aria-label={`Remove ${f.name}`} className="text-forest-600 hover:text-forest-900">
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      ))}
      {row.resources.length < MAX_RESOURCES_PER_LESSON ? (
        <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-brand-700 hover:underline">
          <Upload className="h-3.5 w-3.5" aria-hidden /> Add study material (PDF, slides, images)
          <input
            type="file"
            accept={RESOURCE_ACCEPT}
            multiple
            className="sr-only"
            onChange={(e) => {
              onAttach(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
      ) : null}
    </div>
  );
}
