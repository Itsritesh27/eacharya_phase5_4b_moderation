"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, CalendarPlus } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/input";
import { scheduleLiveSessionAction } from "@/lib/live-sessions/actions";

export function ScheduleForm({ courses }: { courses: { id: string; title: string }[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    setError(null); setFieldErrors({}); setDone(false);
    const local = String(fd.get("startsAt") ?? "");
    // The picker gives the teacher's local time without a zone; convert it to an exact instant.
    const startsAt = local && !Number.isNaN(Date.parse(local)) ? new Date(local).toISOString() : "";
    startTransition(async () => {
      const result = await scheduleLiveSessionAction({
        courseId: fd.get("courseId"), title: fd.get("title"), description: fd.get("description"),
        startsAt, durationMinutes: fd.get("durationMinutes"),
      });
      if (result.ok) { form.reset(); setDone(true); router.refresh(); }
      else { setError(result.error); setFieldErrors(result.fieldErrors ?? {}); }
    });
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2" noValidate>
      <div className="sm:col-span-2">
        <Label htmlFor="courseId">Course</Label>
        <select id="courseId" name="courseId" required defaultValue=""
          aria-invalid={Boolean(fieldErrors.courseId)}
          className="h-11 w-full rounded-xl border border-sage-300 bg-white px-3.5 text-sm text-forest-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
          <option value="" disabled>Choose a course</option>
          {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
        </select>
        <FieldError id="courseId-err" message={fieldErrors.courseId} />
      </div>
      <div className="sm:col-span-2">
        <Label htmlFor="title">Class title</Label>
        <Input id="title" name="title" maxLength={150} placeholder="e.g. Rivers of India: doubt-clearing" aria-invalid={Boolean(fieldErrors.title)} />
        <FieldError id="title-err" message={fieldErrors.title} />
      </div>
      <div>
        <Label htmlFor="startsAt">Date and time</Label>
        <Input id="startsAt" name="startsAt" type="datetime-local" aria-invalid={Boolean(fieldErrors.startsAt)} />
        <FieldError id="startsAt-err" message={fieldErrors.startsAt} />
      </div>
      <div>
        <Label htmlFor="durationMinutes">Duration (minutes)</Label>
        <Input id="durationMinutes" name="durationMinutes" type="number" min={10} max={240} step={5} defaultValue={45} aria-invalid={Boolean(fieldErrors.durationMinutes)} />
        <FieldError id="durationMinutes-err" message={fieldErrors.durationMinutes} />
      </div>
      <div className="sm:col-span-2">
        <Label htmlFor="description">Description (optional)</Label>
        <textarea id="description" name="description" rows={3} maxLength={1000}
          className="w-full rounded-xl border border-sage-300 bg-white px-3.5 py-2.5 text-sm text-forest-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500" />
        <FieldError id="description-err" message={fieldErrors.description} />
      </div>
      <div className="sm:col-span-2 space-y-3">
        {error && <Alert tone="error">{error}</Alert>}
        {done && <Alert tone="success">Class scheduled. Enrolled students can see it now.</Alert>}
        <Button type="submit" disabled={pending || courses.length === 0}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <CalendarPlus className="h-4 w-4" aria-hidden />}
          {pending ? "Scheduling…" : "Schedule class"}
        </Button>
        {courses.length === 0 && <p className="text-sm text-forest-600">Create a course first, then you can schedule live classes for it.</p>}
      </div>
    </form>
  );
}
