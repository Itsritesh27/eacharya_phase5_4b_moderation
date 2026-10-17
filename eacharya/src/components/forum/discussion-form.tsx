"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { FieldError, Input, Label } from "@/components/ui/input";
import { Hint, Select, Textarea } from "@/components/assessments/form-controls";
import { createDiscussionAction, updateDiscussionAction } from "@/lib/forum/actions";
import { FORUM_CATEGORIES, FORUM_GRADES } from "@/lib/forum/categories";
import {
  BODY_MAX, MAX_LINKS, TITLE_MAX, createDiscussionSchema, fieldErrorsFrom, splitLinkLines, updateDiscussionSchema,
} from "@/lib/forum/validation";

type Props =
  | { mode: "create" }
  | { mode: "edit"; discussion: { id: string; title: string; body: string; links: string[] }; onDone: () => void };

const FIELD_ORDER = ["title", "grade", "category", "body", "links"];

export function DiscussionForm(props: Props) {
  const router = useRouter();
  const editing = props.mode === "edit";
  const d = props.mode === "edit" ? props.discussion : null;

  const [title, setTitle] = useState(d?.title ?? "");
  const [body, setBody] = useState(d?.body ?? "");
  const [grade, setGrade] = useState("");
  const [category, setCategory] = useState("");
  const [linksText, setLinksText] = useState(d?.links.join("\n") ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "saving" | "done">("idle");
  // One token per opened form. A retry or double click re-sends the same token, so the database can
  // recognise it and return the original post instead of creating a second one.
  const [clientToken] = useState(() => crypto.randomUUID());
  const lock = useRef(false);

  const busy = status !== "idle";

  function focusFirst(errs: Record<string, string>) {
    const first = FIELD_ORDER.find((k) => errs[k]);
    if (first) requestAnimationFrame(() => document.getElementById(`forum-${first}`)?.focus());
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (lock.current) return; // blocks a second click before React has re-rendered
    lock.current = true;
    setFormError(null);

    const links = splitLinkLines(linksText);
    const input = editing
      ? { id: d!.id, title, body, links }
      : { title, body, grade: grade === "" ? undefined : Number(grade), category: category || undefined, links, clientToken };
    const check = editing ? updateDiscussionSchema.safeParse(input) : createDiscussionSchema.safeParse(input);
    if (!check.success) {
      const errs = fieldErrorsFrom(check.error);
      setErrors(errs);
      focusFirst(errs);
      lock.current = false;
      return;
    }
    setErrors({});
    setStatus("saving");

    try {
      if (props.mode === "edit") {
        const res = await updateDiscussionAction(input);
        if (res.ok) {
          setStatus("done");
          props.onDone();
          router.refresh();
          return;
        }
        fail(res.error, res.fieldErrors);
      } else {
        const res = await createDiscussionAction(input);
        // Navigate only after the server confirms the row exists in the database.
        if (res.ok) {
          setStatus("done");
          router.push(`/forum/${res.id}`);
          return; // lock stays on while navigating
        }
        fail(res.error, res.fieldErrors);
      }
    } catch {
      fail("We could not reach the server. Check your connection and try again. Your text is still here.");
    }
  }

  function fail(message: string, fieldErrors?: Record<string, string>) {
    setErrors(fieldErrors ?? {});
    setFormError(message);
    setStatus("idle");
    lock.current = false;
    if (fieldErrors) focusFirst(fieldErrors);
  }

  const err = (k: string) => errors[k];
  const aria = (k: string, hint?: string) => ({
    "aria-invalid": err(k) ? true : undefined,
    "aria-describedby": [hint, err(k) ? `forum-${k}-error` : null].filter(Boolean).join(" ") || undefined,
  });

  return (
    <form onSubmit={submit} noValidate className="space-y-5" aria-busy={busy}>
      {formError && <Alert tone="error">{formError}</Alert>}

      <div>
        <Label htmlFor="forum-title">Discussion title</Label>
        <Input id="forum-title" value={title} onChange={(e) => setTitle(e.target.value)} disabled={busy} maxLength={TITLE_MAX * 2}
          placeholder="e.g. Why does the monsoon reach Kerala first?" {...aria("title", "forum-title-hint")} />
        <Hint id="forum-title-hint">{title.trim().length} / {TITLE_MAX} characters</Hint>
        <FieldError id="forum-title-error" message={err("title")} />
      </div>

      {!editing && (
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <Label htmlFor="forum-grade">Class</Label>
            <Select id="forum-grade" value={grade} onChange={(e) => setGrade(e.target.value)} disabled={busy} {...aria("grade")}>
              <option value="">Choose a class</option>
              {FORUM_GRADES.map((g) => <option key={g} value={g}>Class {g}</option>)}
            </Select>
            <FieldError id="forum-grade-error" message={err("grade")} />
          </div>
          <div>
            <Label htmlFor="forum-category">Topic category</Label>
            <Select id="forum-category" value={category} onChange={(e) => setCategory(e.target.value)} disabled={busy} {...aria("category")}>
              <option value="">Choose a category</option>
              {FORUM_CATEGORIES.map((c) => <option key={c.slug} value={c.slug}>{c.label}</option>)}
            </Select>
            <FieldError id="forum-category-error" message={err("category")} />
          </div>
        </div>
      )}

      <div>
        <Label htmlFor="forum-body">Your question or description</Label>
        <Textarea id="forum-body" rows={8} value={body} onChange={(e) => setBody(e.target.value)} disabled={busy}
          placeholder="Explain what you are trying to understand and what you have already tried." {...aria("body", "forum-body-hint")} />
        <Hint id="forum-body-hint">{body.trim().length.toLocaleString("en-US")} / {BODY_MAX.toLocaleString("en-US")} characters</Hint>
        <FieldError id="forum-body-error" message={err("body")} />
      </div>

      <div>
        <Label htmlFor="forum-links">Supporting links (optional)</Label>
        <Textarea id="forum-links" rows={3} value={linksText} onChange={(e) => setLinksText(e.target.value)} disabled={busy}
          placeholder="https://example.org/article" {...aria("links", "forum-links-hint")} />
        <Hint id="forum-links-hint">Up to {MAX_LINKS} links, one per line. Only https:// links are accepted.</Hint>
        <FieldError id="forum-links-error" message={err("links")} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={busy}>
          {status === "saving" ? (editing ? "Saving…" : "Posting…") : status === "done" ? (editing ? "Saved" : "Opening your discussion…") : editing ? "Save changes" : "Post discussion"}
        </Button>
        {editing && <Button variant="secondary" onClick={props.onDone} disabled={busy}>Cancel</Button>}
        <span role="status" aria-live="polite" className="sr-only">{status === "saving" ? "Saving, please wait." : ""}</span>
      </div>
    </form>
  );
}
