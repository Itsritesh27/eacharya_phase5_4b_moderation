"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button, buttonClasses } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { createCourseAction } from "@/lib/learning/course-actions";

interface Option {
  id: string;
  label: string;
}

const selectClass =
  "h-11 w-full rounded-xl border border-sage-300 bg-white px-3 text-sm text-forest-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500";

export function CreateCourseForm({ classes, subjects }: { classes: Option[]; subjects: Option[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    setError(null);
    startTransition(async () => {
      const result = await createCourseAction({
        title: data.get("title"),
        description: data.get("description") ?? "",
        classId: data.get("classId"),
        subjectId: data.get("subjectId"),
      });
      if (result.ok) {
        setCreated(result.title);
        form.reset();
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error && <Alert tone="error">{error}</Alert>}
      {created && (
        <Alert tone="success">
          “{created}” was saved as a draft. An administrator publishes it.{" "}
          <Link href="/dashboard/teacher" className="font-semibold underline">
            View your courses
          </Link>
        </Alert>
      )}
      <div>
        <Label htmlFor="title">Course title</Label>
        <Input id="title" name="title" required minLength={3} maxLength={120} placeholder="e.g. Class 11 Fundamentals of Physical Geography" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="classId">Class</Label>
          <select id="classId" name="classId" required defaultValue="" className={selectClass}>
            <option value="" disabled>Select class</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="subjectId">Subject</Label>
          <select id="subjectId" name="subjectId" required defaultValue="" className={selectClass}>
            <option value="" disabled>Select subject</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <Label htmlFor="description">Description (optional)</Label>
        <textarea
          id="description"
          name="description"
          rows={4}
          maxLength={1000}
          className="w-full rounded-xl border border-sage-300 bg-white px-3.5 py-2.5 text-sm text-forest-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        />
      </div>
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          {pending ? "Saving…" : "Create draft course"}
        </Button>
        <Link href="/dashboard/teacher" className={buttonClasses("secondary", "md")}>
          Back to dashboard
        </Link>
      </div>
    </form>
  );
}
