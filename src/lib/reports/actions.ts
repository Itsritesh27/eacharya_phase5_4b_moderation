"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export async function releaseAssessmentResultsAction(assessmentId: string) {
  await requireRole("teacher");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(assessmentId)) {
    return { ok: false as const, message: "Invalid assessment." };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("release_assessment_results", { p_assessment: assessmentId });
  if (error) {
    // Do not expose raw database errors to the browser.
    return { ok: false as const, message: "Results could not be released. Check the Phase G migration and your assessment permissions." };
  }
  revalidatePath("/dashboard/teacher/analytics");
  revalidatePath("/dashboard/teacher/reports");
  revalidatePath("/dashboard/student/results");
  return { ok: true as const, message: "Results released to eligible students." };
}
