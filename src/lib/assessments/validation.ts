import { z, type ZodError } from "zod";

const uuid = z.string().uuid();

export const QUESTION_TYPES = [
  "single_choice",
  "true_false",
  "multiple_select",
  "short_answer",
  "descriptive",
] as const;

export const QUESTION_TYPE_LABEL: Record<(typeof QUESTION_TYPES)[number], string> = {
  single_choice: "Multiple choice",
  multiple_select: "Multiple select",
  true_false: "True / False",
  short_answer: "Short answer",
  descriptive: "Long answer",
};

const dateTime = z.string().datetime({ message: "Enter a valid date and time." }).nullable();

const baseShape = {
  title: z
    .string()
    .trim()
    .min(1, "Enter a title for the assessment.")
    .max(200, "The title must be 200 characters or fewer."),
  description: z.string().trim().max(2000, "The description must be 2,000 characters or fewer."),
  instructions: z.string().trim().max(10000, "The instructions must be 10,000 characters or fewer."),
  unitId: uuid.nullable(),
  durationMinutes: z
    .number({ invalid_type_error: "Enter the duration in minutes." })
    .int("The duration must be a whole number of minutes.")
    .min(1, "The duration must be at least 1 minute.")
    .max(600, "The duration cannot be more than 600 minutes."),
  attemptLimit: z
    .number({ invalid_type_error: "Enter a whole number or leave blank." })
    .int("Attempts must be a whole number.")
    .min(1, "Attempts must be at least 1.")
    .max(50, "Attempts cannot be more than 50.")
    .nullable(),
  opensAt: dateTime,
  closesAt: dateTime,
};

type WindowFields = { opensAt: string | null; closesAt: string | null };

function checkWindow(v: WindowFields, ctx: z.RefinementCtx) {
  if (v.opensAt && v.closesAt && new Date(v.closesAt) <= new Date(v.opensAt)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["closesAt"],
      message: "The closing time must be after the opening time.",
    });
  }
}

/** Creating: course is chosen once and never changes. Passing marks come later, once questions exist. */
export const createAssessmentSchema = z
  .object({ ...baseShape, courseId: uuid })
  .superRefine(checkWindow);

export const assessmentSettingsSchema = z
  .object({
    ...baseShape,
    passingMarks: z
      .number({ invalid_type_error: "Enter the passing marks or leave blank." })
      .positive("Passing marks must be greater than 0.")
      .max(100000, "Passing marks are too large.")
      .nullable(),
  })
  .superRefine(checkWindow);

export type AssessmentSettingsInput = z.infer<typeof assessmentSettingsSchema>;
export type CreateAssessmentInput = z.infer<typeof createAssessmentSchema>;

export const questionInputSchema = z
  .object({
    id: uuid.optional(),
    assessmentId: uuid,
    type: z.enum(QUESTION_TYPES),
    text: z
      .string()
      .trim()
      .min(1, "Enter the question text.")
      .max(5000, "The question must be 5,000 characters or fewer."),
    marks: z
      .number({ invalid_type_error: "Enter the marks for this question." })
      .positive("Marks must be greater than 0.")
      .max(1000, "Marks cannot be more than 1,000.")
      .refine((m) => Math.abs(m * 100 - Math.round(m * 100)) < 1e-6, "Use at most two decimal places."),
    explanation: z.string().trim().max(5000, "The explanation must be 5,000 characters or fewer."),
    options: z.array(z.object({ text: z.string().trim() })).max(10, "Use at most 10 options."),
    correctIndexes: z.array(z.number().int().min(0)),
    correctBoolean: z.boolean().nullable(),
    acceptedAnswers: z.array(z.string().trim()),
    caseSensitive: z.boolean(),
  })
  .superRefine((q, ctx) => {
    const add = (path: string, message: string) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });

    if (q.type === "single_choice" || q.type === "multiple_select") {
      if (q.options.length < 2) add("options", "Add at least two options.");
      else if (q.options.some((o) => o.text === "")) add("options", "Every option needs text. Remove empty options.");
      else if (q.options.some((o) => o.text.length > 1000)) add("options", "Each option must be 1,000 characters or fewer.");

      const valid = new Set(q.correctIndexes.filter((i) => i < q.options.length));
      if (q.type === "single_choice" && valid.size !== 1) add("correct", "Select the one correct option.");
      if (q.type === "multiple_select" && valid.size < 1) add("correct", "Select at least one correct option.");
    }

    if (q.type === "true_false" && q.correctBoolean === null) {
      add("correctBoolean", "Choose whether the statement is true or false.");
    }

    if (q.type === "short_answer") {
      const answers = q.acceptedAnswers.filter((a) => a !== "");
      if (answers.length < 1) add("acceptedAnswers", "Add at least one accepted answer.");
      else if (answers.length > 20) add("acceptedAnswers", "Use at most 20 accepted answers.");
      else if (answers.some((a) => a.length > 200)) add("acceptedAnswers", "Each accepted answer must be 200 characters or fewer.");
    }
  });

export type QuestionInput = z.infer<typeof questionInputSchema>;

/** Drops fields that do not apply to the question type so nothing stray is stored. */
export function normaliseQuestion(q: QuestionInput): QuestionInput {
  const choice = q.type === "single_choice" || q.type === "multiple_select";
  return {
    ...q,
    options: choice ? q.options : [],
    correctIndexes: choice ? [...new Set(q.correctIndexes)].sort((a, b) => a - b) : [],
    correctBoolean: q.type === "true_false" ? q.correctBoolean : null,
    acceptedAnswers: q.type === "short_answer" ? q.acceptedAnswers.filter((a) => a !== "") : [],
    caseSensitive: q.type === "short_answer" ? q.caseSensitive : false,
  };
}

/** First message per field, keyed by the field name (first path segment). */
export function fieldErrorsFrom(error: ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}
