"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { FieldError, Label } from "@/components/ui/input";
import { Hint, Textarea } from "@/components/assessments/form-controls";
import { deleteReplyAction, updateReplyAction } from "@/lib/forum/actions";
import { REPLY_MAX, fieldErrorsFrom, updateReplySchema } from "@/lib/forum/validation";
import { RoleBadge } from "./author-line";
import { LikeButton } from "./like-button";
import { ReportButton } from "./report-button";
import type { AuthorCard } from "@/lib/forum/types";

interface Props {
  id: string;
  body: string;
  author: AuthorCard | undefined;
  dateLabel: string;
  edited: boolean;
  /** True only for the reply's own author (decided on the server; the database enforces it again). */
  canManage: boolean;
  likeCount: number;
  likedByMe: boolean;
  /** Offered to everyone except the reply's own author. */
  canReport: boolean;
  alreadyReported: boolean;
}

export function ReplyItem({ id, body, author, dateLabel, edited, canManage, likeCount, likedByMe, canReport, alreadyReported }: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<"view" | "edit" | "confirm-delete">("view");
  const [draft, setDraft] = useState(body);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    const check = updateReplySchema.safeParse({ id, body: draft });
    if (!check.success) { setFieldError(fieldErrorsFrom(check.error).body); return; }
    setFieldError(undefined);
    setBusy(true);
    try {
      const res = await updateReplyAction({ id, body: draft });
      if (res.ok) { setMode("view"); router.refresh(); } else { setError(res.error); setFieldError(res.fieldErrors?.body); }
    } catch { setError("We could not reach the server. Please try again."); }
    finally { setBusy(false); }
  }

  async function remove() {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const res = await deleteReplyAction(id);
      if (res.ok) router.refresh(); else { setError(res.error); setMode("view"); }
    } catch { setError("We could not reach the server. Please try again."); setMode("view"); }
    finally { setBusy(false); }
  }

  return (
    <li id={`reply-${id}`} className="scroll-mt-24 rounded-card border border-sage-200 bg-white p-4 shadow-card sm:p-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span className="font-semibold text-forest-900">{author?.name ?? "eAcharya member"}</span>
        {author && <RoleBadge role={author.role} />}
        <span className="text-forest-600">{dateLabel}{edited ? " · edited" : ""}</span>
      </div>

      {mode === "edit" ? (
        <form onSubmit={save} noValidate className="mt-3 space-y-3">
          <div>
            <Label htmlFor={`edit-${id}`}>Edit your reply</Label>
            <Textarea id={`edit-${id}`} rows={4} value={draft} onChange={(e) => setDraft(e.target.value)} disabled={busy}
              aria-invalid={fieldError ? true : undefined} aria-describedby={fieldError ? `edit-${id}-error` : undefined} />
            <Hint>{draft.trim().length.toLocaleString("en-US")} / {REPLY_MAX.toLocaleString("en-US")} characters</Hint>
            <FieldError id={`edit-${id}-error`} message={fieldError} />
          </div>
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => { setMode("view"); setDraft(body); setFieldError(undefined); }}>Cancel</Button>
          </div>
        </form>
      ) : (
        <p className="mt-3 whitespace-pre-wrap break-words text-forest-900">{body}</p>
      )}

      {error && <div className="mt-3"><Alert tone="error">{error}</Alert></div>}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <LikeButton kind="reply" id={id} initialCount={likeCount} initialLiked={likedByMe} />
        {canReport && <ReportButton contentType="reply" contentId={id} initialReported={alreadyReported} />}
      </div>

      {canManage && mode === "view" && (
        <div className="mt-3 flex gap-2">
          <Button size="sm" variant="ghost" onClick={() => { setDraft(body); setMode("edit"); }}>Edit</Button>
          <Button size="sm" variant="ghost" onClick={() => setMode("confirm-delete")}>Delete</Button>
        </div>
      )}
      {canManage && mode === "confirm-delete" && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm" role="group" aria-label="Confirm deleting this reply">
          <span className="text-forest-800">Delete this reply? This cannot be undone.</span>
          <Button size="sm" variant="danger" onClick={remove} disabled={busy}>{busy ? "Deleting…" : "Delete"}</Button>
          <Button size="sm" variant="secondary" onClick={() => setMode("view")} disabled={busy}>Keep it</Button>
        </div>
      )}
    </li>
  );
}
