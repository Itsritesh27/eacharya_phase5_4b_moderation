"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Card, CardBody } from "@/components/ui/card";
import { deleteDiscussionAction } from "@/lib/forum/actions";
import { DiscussionForm } from "./discussion-form";

interface Props {
  discussion: { id: string; title: string; body: string; links: string[] };
  replyCount: number;
}

/** Rendered only for the discussion's own author. The database enforces the same rules again. */
export function DiscussionOwnerTools({ discussion, replyCount }: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<"idle" | "edit" | "confirm">("idle");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const hasReplies = replyCount > 0;

  async function remove() {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const res = await deleteDiscussionAction(discussion.id);
      if (res.ok) { router.push("/forum"); router.refresh(); return; }
      setError(res.error); setMode("idle");
    } catch { setError("We could not reach the server. Please try again."); setMode("idle"); }
    finally { setBusy(false); }
  }

  if (mode === "edit") {
    return (
      <Card className="mt-4">
        <CardBody>
          <h2 className="mb-4 text-lg font-bold">Edit your discussion</h2>
          <DiscussionForm mode="edit" discussion={discussion} onDone={() => setMode("idle")} />
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="mt-4 space-y-3">
      {error && <Alert tone="error">{error}</Alert>}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="secondary" onClick={() => setMode("edit")}><Pencil className="h-4 w-4" aria-hidden /> Edit</Button>
        <Button size="sm" variant="secondary" onClick={() => setMode("confirm")} disabled={hasReplies} aria-describedby={hasReplies ? "no-delete-note" : undefined}>
          <Trash2 className="h-4 w-4" aria-hidden /> Delete
        </Button>
        {hasReplies && <span id="no-delete-note" className="text-xs text-forest-600">A discussion with replies can&apos;t be deleted.</span>}
      </div>
      {mode === "confirm" && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-danger-600/30 bg-danger-50 p-3 text-sm" role="group" aria-label="Confirm deleting this discussion">
          <span className="text-danger-700">Delete this discussion? This cannot be undone.</span>
          <Button size="sm" variant="danger" onClick={remove} disabled={busy}>{busy ? "Deleting…" : "Delete discussion"}</Button>
          <Button size="sm" variant="secondary" onClick={() => setMode("idle")} disabled={busy}>Keep it</Button>
        </div>
      )}
    </div>
  );
}
