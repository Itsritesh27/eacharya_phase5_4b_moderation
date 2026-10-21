import { z } from "zod";
import { DESCRIPTION_MAX, DURATION_MAX, DURATION_MIN, TITLE_MAX, TITLE_MIN } from "./rules";

const clean = (v: string) => v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();

export const idSchema = z.string().uuid();

export const scheduleSchema = z.object({
  courseId: z.string().uuid("Choose a course."),
  title: z.string().max(400).transform((v) => clean(v).replace(/\s+/g, " "))
    .pipe(z.string().min(TITLE_MIN, `Title must be at least ${TITLE_MIN} characters.`).max(TITLE_MAX, `Title must be at most ${TITLE_MAX} characters.`)),
  description: z.string().max(5000).transform(clean).pipe(z.string().max(DESCRIPTION_MAX, `Description must be at most ${DESCRIPTION_MAX} characters.`)).default(""),
  startsAt: z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Choose a valid date and time.")
    .transform((v) => new Date(v).toISOString()),
  durationMinutes: z.coerce.number().int("Use whole minutes.").min(DURATION_MIN, `At least ${DURATION_MIN} minutes.`).max(DURATION_MAX, `At most ${DURATION_MAX} minutes.`),
});
export type ScheduleInput = z.input<typeof scheduleSchema>;

export function fieldErrorsFrom(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
