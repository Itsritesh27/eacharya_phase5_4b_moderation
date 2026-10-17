"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { markLessonCompleteAction } from "@/lib/learning/actions";

export function CompleteButton({
  lessonId,
  completed,
  disabled = false,
}: {
  lessonId: string;
  completed: boolean;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (completed) {
    return (
      <span className="inline-flex h-11 items-center gap-2 rounded-xl bg-brand-50 px-4 text-sm font-semibold text-brand-800">
        <CheckCircle2 className="h-4 w-4" aria-hidden /> Completed
      </span>
    );
  }

  function onClick() {
    setError(null);
    startTransition(async () => {
      const result = await markLessonCompleteAction(lessonId);
      if (result.ok) router.refresh();
      else setError(result.error);
    });
  }

  return (
    <div>
      <Button onClick={onClick} disabled={pending || disabled}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <CheckCircle2 className="h-4 w-4" aria-hidden />}
        {pending ? "Saving…" : "Mark as Complete"}
      </Button>
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger-600">
          {error}
        </p>
      )}
    </div>
  );
}
