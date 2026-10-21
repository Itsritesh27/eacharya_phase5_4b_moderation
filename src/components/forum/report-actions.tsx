"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/input";
import { Hint, Textarea } from "@/components/assessments/form-controls";
import { moderateReportAction, restoreReportContentAction } from "@/lib/forum/moderation-actions";
import { NOTE_MAX, isAllowedTransition, statusLabel, type ReportStatus } from "@/lib/forum/moderation";

interface Props {
  reportId: string;
  status: ReportStatus;
  contentState: "available" | "hidden" | "deleted";
}

type Mode = null | "dismissed" | "action_taken" | "restore";

/**
 * Moderator controls for one report. Only shows moves the database will accept (the database checks again), sends only
 * the report id, the wanted status, a note and a hide flag (never a moderator id), and ignores clicks while a request runs.
 */
export function ReportActions({ reportId, status, contentState }: Props) {
  const router = useRouter();
  const lock = useRef(false);
  const [mode, setMode] = useState<Mode>(null);
  const [note, setNote] = useState("");
  const [hide, setHide] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noteError, setNoteError] = useState<string | undefined>();
  const [success, setSuccess] = useState<string | null>(null);

  const canReview = isAllowedTransition(status, "reviewed");
  const canResolve = isAllowedTransition(status, "dismissed");
  const canRestore = status === "action_taken" && contentState === "hidden";
  if (!canReview && !canResolve && !canRestore && !success) return null;

  function reset() { setMode(null); setNote(""); setHide(false); setError(null); setNoteError(undefined); }

  async function run(kind: "reviewed" | "dismissed" | "action_taken" | "restore") {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(null); setNoteError(undefined); setSuccess(null);
    try {
      const res = kind === "restore"
        ? await restoreReportContentAction({ reportId, note })
        : await moderateReportAction({ reportId, status: kind, note, hideContent: kind === "action_taken" && hide });
      if (res.ok) {
        setSuccess(
          kind === "restore" ? "The content is visible again."
            : res.contentAction === "hidden" ? `Marked "${statusLabel(kind)}" and the content is now hidden.`
            : `Marked "${statusLabel(kind)}".`,
        );
        reset();
        router.refresh();
      } else {
        setError(res.error);
        setNoteError(res.fieldErrors?.note);
        // A stale queue (someone else already acted) is fixed by reloading it.
        if (/already|no longer/i.test(res.error)) router.refresh();
      }
    } catch {
      setError("We could not reach the server. Check your connection and try again.");
    } finally {
      lock.current = false; setBusy(false);
    }
  }

  const noteId = `note-${reportId}`;
  return (
    <div className="mt-4 border-t border-sage-100 pt-4">
      {success && <div className="mb-3"><Alert tone="success">{success}</Alert></div>}
      {error && <div className="mb-3"><Alert tone="error">{error}</Alert></div>}

      {mode === null && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Moderation actions">
          {canReview && <Button size="sm" variant="secondary" disabled={busy} onClick={() => run("reviewed")}>{busy ? "Saving…" : "Mark reviewed"}</Button>}
          {canResolve && <Button size="sm" variant="secondary" disabled={busy} onClick={() => { setMode("dismissed"); setSuccess(null); }}>Dismiss…</Button>}
          {canResolve && <Button size="sm" disabled={busy} onClick={() => { setMode("action_taken"); setSuccess(null); }}>Action taken…</Button>}
          {canRestore && <Button size="sm" variant="secondary" disabled={busy} onClick={() => { setMode("restore"); setSuccess(null); }}>Restore content…</Button>}
        </div>
      )}

      {mode !== null && (
        <form onSubmit={(e) => { e.preventDefault(); void run(mode); }} noValidate className="space-y-3" aria-busy={busy}>
          <p className="text-sm font-semibold text-forest-900">
            {mode === "dismissed" ? "Dismiss this report" : mode === "action_taken" ? "Mark action taken" : "Make the content visible again"}
          </p>
          <div>
            <label htmlFor={noteId} className="mb-1.5 block text-sm font-medium text-forest-800">Moderation note (optional)</label>
            <Textarea id={noteId} rows={3} value={note} onChange={(e) => setNote(e.target.value)} disabled={busy}
              aria-invalid={noteError ? true : undefined} aria-describedby={`${noteId}-hint${noteError ? ` ${noteId}-error` : ""}`} />
            <Hint id={`${noteId}-hint`}>Visible to moderators only. {note.trim().length.toLocaleString("en-US")} / {NOTE_MAX.toLocaleString("en-US")}</Hint>
            <FieldError id={`${noteId}-error`} message={noteError} />
          </div>
          {mode === "action_taken" && contentState === "available" && (
            <label className="flex items-start gap-2 text-sm text-forest-900">
              <input type="checkbox" checked={hide} onChange={(e) => setHide(e.target.checked)} disabled={busy} className="mt-0.5 h-4 w-4 accent-brand-600" />
              <span><span className="font-semibold">Also hide this content</span><span className="block text-forest-600">It disappears for other members. Nothing is deleted, and you can restore it.</span></span>
            </label>
          )}
          {mode === "action_taken" && contentState === "deleted" && (
            <p className="text-sm text-forest-600">The reported post no longer exists, so there is nothing to hide.</p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm" disabled={busy}>{busy ? "Saving…" : "Confirm"}</Button>
            <Button size="sm" variant="secondary" disabled={busy} onClick={reset}>Cancel</Button>
          </div>
        </form>
      )}
    </div>
  );
}
