"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { saveNoteAction } from "@/lib/learning/actions";

const MAX = 5000;

export function NotesEditor({ lessonId, initial }: { lessonId: string; initial: string }) {
  const [value, setValue] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [status, setStatus] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    setStatus(null);
    startTransition(async () => {
      const result = await saveNoteAction({ lessonId, body: value });
      if (result.ok) {
        setSaved(value);
        setStatus({ tone: "ok", text: "Saved. Only you can see your notes." });
      } else {
        setStatus({ tone: "error", text: result.error });
      }
    });
  }

  return (
    <div>
      <label htmlFor="lesson-note" className="mb-1.5 block text-sm font-medium text-forest-800">
        Your private notes
      </label>
      <textarea
        id="lesson-note"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        maxLength={MAX}
        rows={8}
        className="w-full rounded-xl border border-sage-300 bg-white p-3 text-sm text-forest-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        placeholder="Write down key points, questions or examples…"
      />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs text-forest-500">
          {value.length}/{MAX}
        </span>
        <div className="flex items-center gap-3">
          {status && (
            <span
              role={status.tone === "error" ? "alert" : "status"}
              className={status.tone === "error" ? "text-sm text-danger-600" : "text-sm text-brand-700"}
            >
              {status.text}
            </span>
          )}
          <Button size="sm" onClick={save} disabled={pending || value === saved}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            Save notes
          </Button>
        </div>
      </div>
    </div>
  );
}
