"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { startAttemptAction } from "@/lib/assessments/attempt-actions";

/**
 * Phase E1: start an assessment or resume the student's existing open attempt.
 * The database is authoritative for eligibility, attempt limits, deadlines and duplicate starts.
 * A request key is reused when retrying the same failed request.
 */
export function StartResumeButton({ assessmentId }: { assessmentId: string }) {
  const router = useRouter();
  const requestKey = useRef<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function startOrResume() {
    if (pending) return;
    setPending(true);
    setError(null);
    setNotice(null);
    // Keep this key after an error so retrying the same click remains idempotent.
    requestKey.current ??= crypto.randomUUID();

    try {
      const result = await startAttemptAction({ assessmentId, requestKey: requestKey.current });
      if (!result.ok) {
        setError(result.error);
        return;
      }

      requestKey.current = null;
      setNotice(result.attempt.resumed ? "Your existing attempt is ready to resume." : "Your attempt has started.");
      // The server page re-checks the open attempt and then retrieves its safe question paper.
      router.refresh();
    } catch {
      setError("We could not start the assessment right now. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-3">
      <Button className="w-full" onClick={startOrResume} disabled={pending} aria-busy={pending}>
        {pending ? "Starting…" : "Start / Resume Assessment"}
      </Button>
      {error && <Alert tone="error">{error}</Alert>}
      {notice && <p className="text-sm text-forest-700" role="status">{notice}</p>}
    </div>
  );
}
