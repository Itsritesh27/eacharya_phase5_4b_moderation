"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const inputSchema = z.object({
  attemptId: z.string().uuid(),
  questionId: z.string().uuid(),
  marks: z.coerce.number().finite().min(0).max(100000),
  feedback: z.string().max(5000).optional().default(""),
});

export type GradeActionResult = { ok: true } | { ok: false; error: string };

export async function gradeAttemptAnswerAction(input: unknown): Promise<GradeActionResult> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Please enter valid marks and feedback." };

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { ok: false, error: "Please sign in again." };

  const { data: profile, error: profileError } = await supabase
    .from("profiles").select("role").eq("id", user.id).maybeSingle();
  const role = (profile as { role?: string } | null)?.role;
  if (profileError || (role !== "teacher" && role !== "admin")) {
    return { ok: false, error: "Only an authorized teacher or administrator can grade answers." };
  }

  const { error } = await supabase.rpc("grade_attempt_answer", {
    p_attempt: parsed.data.attemptId,
    p_question: parsed.data.questionId,
    p_marks: parsed.data.marks,
    p_feedback: parsed.data.feedback.trim() || null,
  });
  if (error) {
    if (error.code === "42501") return { ok: false, error: "You do not have permission to grade this submission." };
    if (error.code === "23514") return { ok: false, error: error.message || "These marks cannot be saved for this answer." };
    return { ok: false, error: "Could not save the grade. Check that the Phase F1 migration is installed, then try again." };
  }

  revalidatePath("/dashboard/teacher/grading");
  revalidatePath("/dashboard/student/results");
  return { ok: true };
}
