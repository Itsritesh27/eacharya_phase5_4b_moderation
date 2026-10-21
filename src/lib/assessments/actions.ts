"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { fetchOwnedAssessment, loadSnapshot } from "./data";
import { getPublishIssues, round2 } from "./publish";
import type { ActionResult, EditorAssessment, Snapshot } from "./types";
import {
  assessmentSettingsSchema,
  createAssessmentSchema,
  fieldErrorsFrom,
  normaliseQuestion,
  questionInputSchema,
  type QuestionInput,
} from "./validation";

const uuid = z.string().uuid();
const LIST_PATH = "/dashboard/teacher/assessments";

const GENERIC = "Something went wrong while saving. Please try again.";

type Ctx = NonNullable<Awaited<ReturnType<typeof teacherContext>>>;

/**
 * Every action: validates input with Zod, takes the user from the server-validated
 * session, requires the teacher role, checks the assessment sits in one of the
 * teacher's own courses, and then relies on RLS as an independent second check.
 * No service-role access is used anywhere.
 */
async function teacherContext() {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if ((data as { role?: string } | null)?.role !== "teacher") return null;
  return { supabase, userId: user.id };
}

const NO_ACCESS = { ok: false as const, error: "Please sign in with a teacher account to continue." };
const NOT_FOUND = {
  ok: false as const,
  error: "This assessment was not found, or you do not have access to it.",
};

/**
 * The database raises plain-language messages (errcode 23514) from its publish and
 * validation triggers; those are safe to show. Raw constraint errors are not.
 */
function friendly(error: { code?: string; message?: string }): string {
  if (error.code === "23514" && error.message && !/violates check constraint/i.test(error.message)) {
    return error.message;
  }
  if (error.code === "42501") return "You do not have permission to change this assessment.";
  return GENERIC;
}

async function ownedDraft(
  ctx: Ctx,
  assessmentId: string,
): Promise<{ ok: true; assessment: EditorAssessment } | { ok: false; error: string }> {
  const assessment = await fetchOwnedAssessment(ctx.supabase, assessmentId, ctx.userId);
  if (!assessment) return NOT_FOUND;
  if (assessment.status !== "draft") {
    return {
      ok: false,
      error: "This assessment is published and locked. Move it back to draft to edit it.",
    };
  }
  return { ok: true, assessment };
}

/** Keeps total_marks equal to the sum of question marks (placeholder 1 when empty). */
async function recalcTotals(ctx: Ctx, assessmentId: string): Promise<string | null> {
  const [marks, head] = await Promise.all([
    ctx.supabase.from("questions").select("marks").eq("assessment_id", assessmentId),
    ctx.supabase.from("assessments").select("passing_marks").eq("id", assessmentId).single(),
  ]);
  if (marks.error || head.error || !head.data) return GENERIC;

  const sum = round2(((marks.data ?? []) as { marks: number }[]).reduce((s, r) => s + Number(r.marks), 0));
  const total = sum > 0 ? sum : 1;
  const passing = (head.data as { passing_marks: number | null }).passing_marks;

  const patch: { total_marks: number; passing_marks?: null } = { total_marks: total };
  // passing_marks may never exceed total_marks; clear it rather than fail the question change.
  if (passing !== null && Number(passing) > total) patch.passing_marks = null;

  const { error } = await ctx.supabase.from("assessments").update(patch).eq("id", assessmentId);
  return error ? GENERIC : null;
}

/** Two-phase renumbering so the unique (assessment, position) constraint never collides. */
async function applyOrder(ctx: Ctx, orderedIds: string[]): Promise<string | null> {
  const phase = async (position: (i: number) => number) => {
    const results = await Promise.all(
      orderedIds.map((id, i) => ctx.supabase.from("questions").update({ position: position(i) }).eq("id", id)),
    );
    return results.some((r) => r.error);
  };
  if (await phase((i) => 100000 + i)) return GENERIC;
  if (await phase((i) => i)) return GENERIC;
  return null;
}

async function snapshotResult(ctx: Ctx, assessmentId: string): Promise<ActionResult<{ snapshot: Snapshot }>> {
  try {
    return { ok: true, snapshot: await loadSnapshot(ctx.supabase, assessmentId) };
  } catch {
    return { ok: false, error: "Saved, but the latest data could not be loaded. Refresh the page." };
  }
}

// ---------------------------------------------------------------
// Assessment
// ---------------------------------------------------------------

export async function createAssessmentAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = createAssessmentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }
  const ctx = await teacherContext();
  if (!ctx) return NO_ACCESS;
  const v = parsed.data;

  // The course must be one this teacher created (RLS enforces the same rule on insert).
  const course = await ctx.supabase
    .from("courses")
    .select("id")
    .eq("id", v.courseId)
    .eq("created_by", ctx.userId)
    .maybeSingle();
  if (course.error || !course.data) {
    return { ok: false, error: "Choose one of your own courses.", fieldErrors: { courseId: "Choose one of your own courses." } };
  }

  // total_marks must be > 0 in the database, so new drafts start at a placeholder of 1.
  // It is recalculated from the questions every time they change.
  const { data, error } = await ctx.supabase
    .from("assessments")
    .insert({
      title: v.title,
      description: v.description,
      instructions: v.instructions,
      course_id: v.courseId,
      unit_id: v.unitId,
      status: "draft",
      total_marks: 1,
      duration_minutes: v.durationMinutes,
      attempt_limit: v.attemptLimit,
      opens_at: v.opensAt,
      closes_at: v.closesAt,
      created_by: ctx.userId,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: friendly(error ?? {}) };

  revalidatePath(LIST_PATH);
  return { ok: true, id: (data as { id: string }).id };
}

export async function updateAssessmentAction(
  assessmentId: unknown,
  input: unknown,
): Promise<ActionResult<{ updatedAt: string }>> {
  const id = uuid.safeParse(assessmentId);
  if (!id.success) return NOT_FOUND;
  const parsed = assessmentSettingsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }
  const ctx = await teacherContext();
  if (!ctx) return NO_ACCESS;
  const draft = await ownedDraft(ctx, id.data);
  if (!draft.ok) return draft;
  const v = parsed.data;

  if (v.passingMarks !== null) {
    const totalMarks = draft.assessment.totalMarks;
    const counted = await ctx.supabase
      .from("questions")
      .select("id", { count: "exact", head: true })
      .eq("assessment_id", id.data);
    if (counted.error) return { ok: false, error: GENERIC };
    if ((counted.count ?? 0) === 0) {
      const m = "Add questions before setting passing marks.";
      return { ok: false, error: m, fieldErrors: { passingMarks: m } };
    }
    if (v.passingMarks > totalMarks) {
      const m = `Passing marks cannot be more than the total marks (${totalMarks}).`;
      return { ok: false, error: m, fieldErrors: { passingMarks: m } };
    }
  }

  const { data, error } = await ctx.supabase
    .from("assessments")
    .update({
      title: v.title,
      description: v.description,
      instructions: v.instructions,
      unit_id: v.unitId,
      duration_minutes: v.durationMinutes,
      attempt_limit: v.attemptLimit,
      passing_marks: v.passingMarks,
      opens_at: v.opensAt,
      closes_at: v.closesAt,
    })
    .eq("id", id.data)
    .eq("status", "draft")
    .select("updated_at")
    .maybeSingle();
  if (error) return { ok: false, error: friendly(error) };
  if (!data) return NOT_FOUND;

  revalidatePath(LIST_PATH);
  return { ok: true, updatedAt: (data as { updated_at: string }).updated_at };
}

export async function deleteAssessmentAction(assessmentId: unknown): Promise<ActionResult> {
  const id = uuid.safeParse(assessmentId);
  if (!id.success) return NOT_FOUND;
  const ctx = await teacherContext();
  if (!ctx) return NO_ACCESS;
  const draft = await ownedDraft(ctx, id.data);
  if (!draft.ok) return draft;

  const { data, error } = await ctx.supabase
    .from("assessments")
    .delete()
    .eq("id", id.data)
    .eq("status", "draft")
    .select("id");
  if (error) return { ok: false, error: friendly(error) };
  if (!data || data.length === 0) return NOT_FOUND;

  revalidatePath(LIST_PATH);
  return { ok: true };
}

// ---------------------------------------------------------------
// Questions
// ---------------------------------------------------------------

/** Writes options, correct options and the answer key for one question. */
async function writeAnswerData(ctx: Ctx, questionId: string, q: QuestionInput, isNew: boolean): Promise<string | null> {
  const { supabase } = ctx;
  const choice = q.type === "single_choice" || q.type === "multiple_select";

  if (choice) {
    // Replace the option set. Deleting an option cascades to its correct-option row.
    // (Safe while no attempts exist; Task 3.3 must revisit this once answers reference options.)
    if (!isNew) {
      const del = await supabase.from("question_options").delete().eq("question_id", questionId);
      if (del.error) return friendly(del.error);
    }
    const ins = await supabase
      .from("question_options")
      .insert(q.options.map((o, i) => ({ question_id: questionId, option_text: o.text, position: i })))
      .select("id, position");
    if (ins.error || !ins.data) return friendly(ins.error ?? {});

    const byPosition = new Map((ins.data as { id: string; position: number }[]).map((r) => [r.position, r.id]));
    const correctRows = q.correctIndexes.flatMap((i) => {
      const optionId = byPosition.get(i);
      return optionId ? [{ question_id: questionId, option_id: optionId }] : [];
    });
    const cor = await supabase.from("question_correct_options").insert(correctRows);
    if (cor.error) return friendly(cor.error);
  }

  const needsKey = q.type === "true_false" || q.type === "short_answer" || q.explanation !== "";
  if (!needsKey) {
    if (!isNew) {
      const del = await supabase.from("question_answer_keys").delete().eq("question_id", questionId);
      if (del.error) return friendly(del.error);
    }
    return null;
  }

  const payload = {
    correct_boolean: q.type === "true_false" ? q.correctBoolean : null,
    accepted_answers: q.type === "short_answer" ? q.acceptedAnswers : [],
    case_sensitive: q.type === "short_answer" ? q.caseSensitive : false,
    explanation: q.explanation === "" ? null : q.explanation,
  };

  // Update-then-insert (not upsert) so only the granted columns are ever written.
  if (!isNew) {
    const upd = await supabase
      .from("question_answer_keys")
      .update(payload)
      .eq("question_id", questionId)
      .select("question_id");
    if (upd.error) return friendly(upd.error);
    if (upd.data && upd.data.length > 0) return null;
  }
  const ins = await supabase.from("question_answer_keys").insert({ question_id: questionId, ...payload });
  return ins.error ? friendly(ins.error) : null;
}

export async function saveQuestionAction(
  input: unknown,
): Promise<ActionResult<{ questionId: string; snapshot: Snapshot }>> {
  const parsed = questionInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }
  const q = normaliseQuestion(parsed.data);
  const ctx = await teacherContext();
  if (!ctx) return NO_ACCESS;
  const draft = await ownedDraft(ctx, q.assessmentId);
  if (!draft.ok) return draft;
  const { supabase } = ctx;

  let questionId: string;

  if (q.id) {
    const existing = await supabase
      .from("questions")
      .select("id, question_type")
      .eq("id", q.id)
      .eq("assessment_id", q.assessmentId)
      .maybeSingle();
    if (existing.error || !existing.data) return { ok: false, error: "This question was not found. Refresh the page." };
    if ((existing.data as { question_type: string }).question_type !== q.type) {
      return { ok: false, error: "A question's type cannot be changed. Delete it and add a new one." };
    }

    const upd = await supabase.from("questions").update({ question_text: q.text, marks: q.marks }).eq("id", q.id);
    if (upd.error) return { ok: false, error: friendly(upd.error) };
    questionId = q.id;

    const err = await writeAnswerData(ctx, questionId, q, false);
    if (err) {
      return { ok: false, error: `${err} The question may be partly saved; reopen it to check before publishing.` };
    }
  } else {
    const last = await supabase
      .from("questions")
      .select("position")
      .eq("assessment_id", q.assessmentId)
      .order("position", { ascending: false })
      .limit(1);
    if (last.error) return { ok: false, error: GENERIC };
    const position = ((last.data as { position: number }[] | null)?.[0]?.position ?? -1) + 1;

    const ins = await supabase
      .from("questions")
      .insert({
        assessment_id: q.assessmentId,
        question_type: q.type,
        question_text: q.text,
        marks: q.marks,
        position,
      })
      .select("id")
      .single();
    if (ins.error || !ins.data) return { ok: false, error: friendly(ins.error ?? {}) };
    questionId = (ins.data as { id: string }).id;

    const err = await writeAnswerData(ctx, questionId, q, true);
    if (err) {
      // Roll back the half-created question (options and keys cascade) so no broken question is left behind.
      await supabase.from("questions").delete().eq("id", questionId);
      return { ok: false, error: err };
    }
  }

  const totalsErr = await recalcTotals(ctx, q.assessmentId);
  if (totalsErr) return { ok: false, error: `Question saved, but totals could not be updated. ${totalsErr}` };

  revalidatePath(LIST_PATH);
  const snap = await snapshotResult(ctx, q.assessmentId);
  return snap.ok ? { ok: true, questionId, snapshot: snap.snapshot } : snap;
}

export async function deleteQuestionAction(
  assessmentId: unknown,
  questionId: unknown,
): Promise<ActionResult<{ snapshot: Snapshot }>> {
  const aid = uuid.safeParse(assessmentId);
  const qid = uuid.safeParse(questionId);
  if (!aid.success || !qid.success) return NOT_FOUND;
  const ctx = await teacherContext();
  if (!ctx) return NO_ACCESS;
  const draft = await ownedDraft(ctx, aid.data);
  if (!draft.ok) return draft;

  const del = await ctx.supabase.from("questions").delete().eq("id", qid.data).eq("assessment_id", aid.data);
  if (del.error) return { ok: false, error: friendly(del.error) };

  const rest = await ctx.supabase
    .from("questions")
    .select("id")
    .eq("assessment_id", aid.data)
    .order("position", { ascending: true });
  if (rest.error) return { ok: false, error: GENERIC };
  const orderErr = await applyOrder(ctx, ((rest.data ?? []) as { id: string }[]).map((r) => r.id));
  if (orderErr) return { ok: false, error: orderErr };
  const totalsErr = await recalcTotals(ctx, aid.data);
  if (totalsErr) return { ok: false, error: totalsErr };

  revalidatePath(LIST_PATH);
  return snapshotResult(ctx, aid.data);
}

export async function reorderQuestionsAction(
  assessmentId: unknown,
  orderedIds: unknown,
): Promise<ActionResult<{ snapshot: Snapshot }>> {
  const aid = uuid.safeParse(assessmentId);
  const ids = z.array(uuid).max(200).safeParse(orderedIds);
  if (!aid.success || !ids.success) return NOT_FOUND;
  const ctx = await teacherContext();
  if (!ctx) return NO_ACCESS;
  const draft = await ownedDraft(ctx, aid.data);
  if (!draft.ok) return draft;

  const current = await ctx.supabase.from("questions").select("id").eq("assessment_id", aid.data);
  if (current.error) return { ok: false, error: GENERIC };
  const have = new Set(((current.data ?? []) as { id: string }[]).map((r) => r.id));
  const want = new Set(ids.data);
  if (have.size !== want.size || ids.data.length !== want.size || [...want].some((id) => !have.has(id))) {
    return { ok: false, error: "The question list changed. Refresh the page and try again." };
  }

  const orderErr = await applyOrder(ctx, ids.data);
  if (orderErr) return { ok: false, error: orderErr };

  revalidatePath(LIST_PATH);
  return snapshotResult(ctx, aid.data);
}

// ---------------------------------------------------------------
// Publishing
// ---------------------------------------------------------------

export async function publishAssessmentAction(assessmentId: unknown): Promise<ActionResult> {
  const id = uuid.safeParse(assessmentId);
  if (!id.success) return NOT_FOUND;
  const ctx = await teacherContext();
  if (!ctx) return NO_ACCESS;
  const draft = await ownedDraft(ctx, id.data);
  if (!draft.ok) return draft;

  const snap = await snapshotResult(ctx, id.data);
  if (!snap.ok) return snap;
  const issues = getPublishIssues(snap.snapshot.questions, snap.snapshot.totalMarks);
  const a = draft.assessment;
  if (a.closesAt && new Date(a.closesAt) <= new Date()) {
    issues.push("The closing time has already passed. Change it in the settings before publishing.");
  }
  if (issues.length > 0) {
    return { ok: false, error: issues[0] ?? "This assessment is not ready to publish.", issues };
  }

  // The database trigger re-checks everything; its message is shown if it disagrees.
  const { data, error } = await ctx.supabase
    .from("assessments")
    .update({ status: "published" })
    .eq("id", id.data)
    .eq("status", "draft")
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: friendly(error) };
  if (!data) return NOT_FOUND;

  revalidatePath(LIST_PATH);
  return { ok: true };
}

/** Back to draft so it can be edited. Attempts do not exist yet; Task 3.3 must block this once they do. */
export async function unpublishAssessmentAction(assessmentId: unknown): Promise<ActionResult> {
  const id = uuid.safeParse(assessmentId);
  if (!id.success) return NOT_FOUND;
  const ctx = await teacherContext();
  if (!ctx) return NO_ACCESS;
  const owned = await fetchOwnedAssessment(ctx.supabase, id.data, ctx.userId);
  if (!owned) return NOT_FOUND;
  if (owned.status === "draft") return { ok: true };

  const { data, error } = await ctx.supabase
    .from("assessments")
    .update({ status: "draft" })
    .eq("id", id.data)
    .eq("status", "published")
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: friendly(error) };
  if (!data) return NOT_FOUND;

  revalidatePath(LIST_PATH);
  return { ok: true };
}
