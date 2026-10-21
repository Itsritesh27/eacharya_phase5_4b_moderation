"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { FieldError, Label } from "@/components/ui/input";
import { Hint, Textarea } from "@/components/assessments/form-controls";
import { createReplyAction } from "@/lib/forum/actions";
import { REPLY_MAX, createReplySchema, fieldErrorsFrom } from "@/lib/forum/validation";

export function ReplyForm({ discussionId }: { discussionId: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [posted, setPosted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [clientToken, setClientToken] = useState(() => crypto.randomUUID());
  const lock = useRef(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (lock.current) return;
    lock.current = true;
    setError(null);
    setPosted(false);

    const input = { discussionId, body, clientToken };
    const check = createReplySchema.safeParse(input);
    if (!check.success) {
      setFieldError(fieldErrorsFrom(check.error).body ?? fieldErrorsFrom(check.error).discussionId);
      lock.current = false;
      document.getElementById("forum-reply")?.focus();
      return;
    }
    setFieldError(undefined);
    setSaving(true);
    try {
      const res = await createReplyAction(input);
      if (res.ok) {
        // Shown only after the server confirmed the save; the list then reloads from the database.
        setBody("");
        setClientToken(crypto.randomUUID()); // a new reply is a new submission
        setPosted(true);
        router.refresh();
      } else {
        setFieldError(res.fieldErrors?.body);
        setError(res.error);
      }
    } catch {
      setError("We could not reach the server. Check your connection and try again. Your reply is still here.");
    } finally {
      setSaving(false);
      lock.current = false;
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-3" aria-busy={saving}>
      {error && <Alert tone="error">{error}</Alert>}
      {posted && !error && <Alert tone="success">Your reply was posted.</Alert>}
      <div>
        <Label htmlFor="forum-reply">Write a reply</Label>
        <Textarea id="forum-reply" rows={5} value={body} onChange={(e) => setBody(e.target.value)} disabled={saving}
          aria-invalid={fieldError ? true : undefined} aria-describedby={fieldError ? "forum-reply-error forum-reply-hint" : "forum-reply-hint"} />
        <Hint id="forum-reply-hint">{body.trim().length.toLocaleString("en-US")} / {REPLY_MAX.toLocaleString("en-US")} characters</Hint>
        <FieldError id="forum-reply-error" message={fieldError} />
      </div>
      <Button type="submit" disabled={saving}>{saving ? "Posting…" : "Post reply"}</Button>
    </form>
  );
}
