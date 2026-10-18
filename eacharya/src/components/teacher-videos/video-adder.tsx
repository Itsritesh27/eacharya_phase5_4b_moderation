"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Loader2, X } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/assessments/form-controls";
import { addVideosAction, previewVideosAction } from "@/lib/teacher-videos/actions";
import { MAX_BATCH, MAX_TITLE, extractVideoLinks, youtubeThumbnail } from "@/lib/teacher-videos/links";

interface Row {
  key: string;
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
  const rowsRef = useRef<Row[]>([]);
  rowsRef.current = rows;

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

  const loading = rows.some((r) => r.state === "loading");
  const missingTitle = rows.some((r) => r.state !== "loading" && r.title.trim() === "");
  const canSave = rows.length > 0 && !loading && !missingTitle && !saving;

  function save() {
    setError(null);
    setSuccess(null);
    startSaving(async () => {
      const res = await addVideosAction({
        unitId,
        publish,
        items: rows.map((r) => ({ url: r.url, title: r.title })),
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
              (res.skipped > 0 ? ` ${res.skipped} already there, skipped.` : ""),
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
                  ) : null}
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
                      <p className="mt-1 truncate text-xs text-forest-600">
                        {r.state === "found"
                          ? `From YouTube${r.author ? ` · ${r.author}` : ""}`
                          : r.kind === "youtube"
                            ? "Could not fetch the title (private, removed, or YouTube unreachable). Please type one."
                            : "Please check the title."}
                      </p>
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
