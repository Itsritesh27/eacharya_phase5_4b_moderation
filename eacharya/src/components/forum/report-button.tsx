"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Flag } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/input";
import { Hint, Textarea } from "@/components/assessments/form-controls";
import { reportContentAction } from "@/lib/forum/actions";
import { REPORT_DESCRIPTION_MAX, REPORT_REASONS, type ReportContentType } from "@/lib/forum/report-reasons";
import { createReportSchema, fieldErrorsFrom } from "@/lib/forum/validation";
import { cn } from "@/lib/utils/cn";

interface Props {
  contentType: ReportContentType;
  contentId: string;
  /** True if this user already reported it (decided on the server from their own rows). */
  initialReported: boolean;
  className?: string;
}

/**
 * "Report" button and dialog. Uses the native <dialog> element, so focus is trapped, Escape closes it and the page
 * behind it is inert without extra code. A report only tells the moderators about a concern: nothing is hidden or
 * deleted. The reporter is never sent from here; the server reads it from the session.
 */
export function ReportButton({ contentType, contentId, initialReported, className }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const lock = useRef(false);
  const [reported, setReported] = useState(initialReported);
  const [reason, setReason] = useState("");
  const [description, setDescription] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<null | "sent" | "already">(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { setReported(initialReported); }, [initialReported]);

  const noun = contentType === "discussion" ? "discussion" : "reply";

  function open() {
    setError(null); setFieldErrors({}); setDone(null);
    dialog.current?.showModal();
  }
  function close() {
    if (busy) return;
    dialog.current?.close();
    opener.current?.focus();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (lock.current) return; // blocks a double click or a second Enter while the first request is running
    setError(null);
    const input = { contentType, contentId, reason, description };
    const check = createReportSchema.safeParse(input);
    if (!check.success) { setFieldErrors(fieldErrorsFrom(check.error)); return; }
    setFieldErrors({});
    lock.current = true;
    setBusy(true);
    try {
      const res = await reportContentAction(input);
      if (res.ok) {
        // Shown only after the server confirmed the report was stored.
        setReported(true);
        setDone(res.alreadyReported ? "already" : "sent");
      } else {
        setFieldErrors(res.fieldErrors ?? {});
        setError(res.error);
      }
    } catch {
      setError("We could not reach the server. Check your connection and try again. Your details are still here.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  const titleId = `report-title-${contentId}`;
  return (
    <span className={cn("inline-flex", className)}>
      {reported && done === null ? (
        <span className="inline-flex h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-medium text-forest-600">
          <CheckCircle2 className="h-4 w-4" aria-hidden /> Reported
        </span>
      ) : (
        <Button ref={opener} size="sm" variant="ghost" onClick={open} aria-haspopup="dialog">
          <Flag className="h-4 w-4" aria-hidden /> Report<span className="sr-only"> this {noun}</span>
        </Button>
      )}

      <dialog
        ref={dialog}
        aria-labelledby={titleId}
        onCancel={(e) => { if (busy) e.preventDefault(); }}
        onClose={() => { setDone(null); opener.current?.focus(); }}
        className="w-[calc(100%-2rem)] max-w-lg rounded-card border border-sage-200 bg-white p-0 text-forest-900 shadow-lift backdrop:bg-forest-950/50"
      >
        {done ? (
          <div className="space-y-4 p-5 sm:p-6" role="status">
            <h2 id={titleId} className="text-lg font-bold">{done === "sent" ? "Thank you for the report" : "Already reported"}</h2>
            <p className="text-sm text-forest-700">
              {done === "sent"
                ? "We have recorded your report. Nothing is removed automatically; it will be looked at by the people who look after the forum."
                : "You have already reported this post, so there is nothing more to send."}
            </p>
            <div className="flex justify-end"><Button onClick={() => { dialog.current?.close(); }}>Close</Button></div>
          </div>
        ) : (
          <form onSubmit={submit} noValidate aria-busy={busy} className="space-y-4 p-5 sm:p-6">
            <div>
              <h2 id={titleId} className="text-lg font-bold">Report this {noun}</h2>
              <p className="mt-1 text-sm text-forest-600">Tell us what is wrong. Your report is private, and nothing is removed automatically.</p>
            </div>
            {error && <Alert tone="error">{error}</Alert>}

            <fieldset disabled={busy} aria-describedby={fieldErrors.reason ? `report-reason-error-${contentId}` : undefined}>
              <legend className="mb-2 text-sm font-medium text-forest-800">Reason</legend>
              <div className="space-y-2">
                {REPORT_REASONS.map((r) => (
                  <label key={r.value} className="flex cursor-pointer items-start gap-3 rounded-xl border border-sage-200 p-3 text-sm has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-500">
                    <input type="radio" name={`reason-${contentId}`} value={r.value} checked={reason === r.value}
                      onChange={() => setReason(r.value)} className="mt-1 h-4 w-4 accent-brand-600" />
                    <span><span className="block font-semibold text-forest-900">{r.label}</span><span className="block text-forest-600">{r.hint}</span></span>
                  </label>
                ))}
              </div>
              <FieldError id={`report-reason-error-${contentId}`} message={fieldErrors.reason} />
            </fieldset>

            <div>
              <label htmlFor={`report-details-${contentId}`} className="mb-1.5 block text-sm font-medium text-forest-800">
                Details {reason === "other" ? "(required)" : "(optional)"}
              </label>
              <Textarea id={`report-details-${contentId}`} rows={3} value={description} maxLength={REPORT_DESCRIPTION_MAX + 200}
                onChange={(e) => setDescription(e.target.value)} disabled={busy}
                aria-invalid={fieldErrors.description ? true : undefined}
                aria-describedby={`report-details-hint-${contentId}${fieldErrors.description ? ` report-details-error-${contentId}` : ""}`} />
              <Hint id={`report-details-hint-${contentId}`}>{description.trim().length.toLocaleString("en-US")} / {REPORT_DESCRIPTION_MAX.toLocaleString("en-US")} characters</Hint>
              <FieldError id={`report-details-error-${contentId}`} message={fieldErrors.description} />
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="secondary" onClick={close} disabled={busy}>Cancel</Button>
              <Button type="submit" disabled={busy}>{busy ? "Sending…" : "Send report"}</Button>
            </div>
          </form>
        )}
      </dialog>
    </span>
  );
}
