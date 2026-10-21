"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { enrollAction } from "@/lib/learning/actions";

export function EnrollButton({
  courseId,
  size = "md",
  className,
}: {
  courseId: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function onClick() {
    setError(null);
    startTransition(async () => {
      const result = await enrollAction(courseId);
      if (result.ok) {
        setDone(true);
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  if (done) {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700">
        <Check className="h-4 w-4" aria-hidden /> Enrolled
      </span>
    );
  }

  return (
    <div className={className}>
      <Button size={size} onClick={onClick} disabled={pending}>
        {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
        {pending ? "Enrolling…" : "Enrol in course"}
      </Button>
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger-600">
          {error}
        </p>
      )}
    </div>
  );
}
