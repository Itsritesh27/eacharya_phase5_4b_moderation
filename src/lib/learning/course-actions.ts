"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export type CreateCourseResult = { ok: true; title: string } | { ok: false; error: string };

const schema = z.object({
  title: z.string().trim().min(3, "Enter a course title (at least 3 characters)").max(120, "Title is too long"),
  description: z.string().trim().max(1000, "Description is too long").default(""),
  classId: z.string().uuid("Choose a class"),
  subjectId: z.string().uuid("Choose a subject"),
});

function slugify(title: string) {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return base || "course";
}

/**
 * Creates a DRAFT course owned by the signed-in teacher/admin. Ownership and
 * draft status are enforced again by RLS; publishing stays an admin action.
 */
export async function createCourseAction(input: unknown): Promise<CreateCourseResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form and try again." };
  if (!isSupabaseConfigured()) return { ok: false, error: "The service is not configured yet." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please sign in again to continue." };

  const base = slugify(parsed.data.title);
  for (let attempt = 0; attempt < 3; attempt++) {
    const slug = attempt === 0 ? base : `${base}-${Math.random().toString(36).slice(2, 7)}`;
    const { error } = await supabase.from("courses").insert({
      title: parsed.data.title,
      slug,
      description: parsed.data.description,
      class_id: parsed.data.classId,
      subject_id: parsed.data.subjectId,
      status: "draft",
      created_by: user.id,
    });
    if (!error) return { ok: true, title: parsed.data.title };
    if (error.code !== "23505") return { ok: false, error: "Could not create the course. Check your teacher access and try again." };
  }
  return { ok: false, error: "Could not create a unique course link. Try a slightly different title." };
}
