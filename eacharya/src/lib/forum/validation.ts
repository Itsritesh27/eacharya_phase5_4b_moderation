import { z, type ZodError } from "zod";
import { validateExternalUrl } from "@/lib/learning/external-url";
import { FORUM_CATEGORIES, FORUM_GRADES } from "./categories";
import { NOTE_MAX } from "./moderation";
import { REPORT_DESCRIPTION_MAX, REPORT_OTHER_MIN, REPORT_REASONS } from "./report-reasons";

/** Limits mirror the CHECK constraints in migration 20261018000001_phase5_2_forum.sql. */
export const TITLE_MIN = 5;
export const TITLE_MAX = 200;
export const BODY_MIN = 10;
export const BODY_MAX = 10000;
export const REPLY_MAX = 5000;
export const MAX_LINKS = 3;
export const LINK_MAX = 500;
/** Raw input is bounded before any processing so a huge payload cannot cost much work. */
const RAW_CAP = 40000;

/** Removes control characters (NUL would make PostgreSQL reject the row) but keeps tab and newline. */
export function stripControl(value: string): string {
  let out = "";
  for (const ch of value) {
    const c = ch.codePointAt(0) ?? 0;
    if (c === 9 || c === 10 || (c >= 32 && c !== 127)) out += ch;
  }
  return out;
}

/** Multi-line text: unify line endings, drop control characters, trim. */
export function cleanText(value: string): string {
  return stripControl(value.replace(/\r\n?/g, "\n")).trim();
}

/** Single-line text: all whitespace runs (including newlines) become one space. */
export function cleanTitle(value: string): string {
  return stripControl(value).replace(/\s+/g, " ").trim();
}

/** One https URL, normalised, or null. Rejects javascript:, data:, http:, credentials, spaces. */
export function normaliseLink(raw: string): string | null {
  const value = raw.trim();
  if (!value || value.length > LINK_MAX || /\s/.test(value)) return null;
  const safe = validateExternalUrl(value);
  if (!safe || !safe.href.startsWith("https://") || safe.href.length > LINK_MAX) return null;
  return safe.href;
}

/** The form's textarea holds one link per line. */
export function splitLinkLines(text: string): string[] {
  return text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
}

const uuid = z.string().uuid("Invalid request. Please reload the page.");

const title = z
  .string({ required_error: "Enter a title.", invalid_type_error: "Enter a title." })
  .max(RAW_CAP)
  .transform(cleanTitle)
  .pipe(
    z
      .string()
      .min(TITLE_MIN, `The title must be at least ${TITLE_MIN} characters.`)
      .max(TITLE_MAX, `The title must be ${TITLE_MAX} characters or fewer.`),
  );

const body = z
  .string({ required_error: "Describe your question.", invalid_type_error: "Describe your question." })
  .max(RAW_CAP, "That is too long.")
  .transform(cleanText)
  .pipe(
    z
      .string()
      .min(BODY_MIN, `Describe your question in at least ${BODY_MIN} characters.`)
      .max(BODY_MAX, `The description must be ${BODY_MAX.toLocaleString("en-US")} characters or fewer.`),
  );

const links = z
  .array(z.string().max(2000, "A link is too long."), { invalid_type_error: "Links are not valid." })
  .max(20, `You can add up to ${MAX_LINKS} links.`)
  .default([])
  .transform((arr) => arr.map((l) => l.trim()).filter(Boolean))
  .pipe(
    z
      .array(z.string())
      .max(MAX_LINKS, `You can add up to ${MAX_LINKS} links.`)
      .superRefine((arr, ctx) => {
        arr.forEach((l, i) => {
          if (!normaliseLink(l)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `Link ${i + 1} must be a full https:// address with no spaces.`,
            });
          }
        });
      })
      .transform((arr) => Array.from(new Set(arr.map((l) => normaliseLink(l) as string)))),
  );

const grade = z
  .number({ required_error: "Choose a class.", invalid_type_error: "Choose a class." })
  .refine((n) => (FORUM_GRADES as readonly number[]).includes(n), "Choose Class 9, 10, 11 or 12.");

const category = z
  .string({ required_error: "Choose a topic category.", invalid_type_error: "Choose a topic category." })
  .refine((s) => FORUM_CATEGORIES.some((c) => c.slug === s), "Choose a topic category.");

const replyBody = z
  .string({ required_error: "Write a reply.", invalid_type_error: "Write a reply." })
  .max(RAW_CAP, "That is too long.")
  .transform(cleanText)
  .pipe(
    z
      .string()
      .min(1, "Write a reply before posting.")
      .max(REPLY_MAX, `A reply must be ${REPLY_MAX.toLocaleString("en-US")} characters or fewer.`),
  );

/**
 * Unknown keys (for example an `authorId` sent by a tampered browser) are stripped by Zod, and the
 * server actions only ever copy the fields below, so the author can never come from the request.
 */
export const createDiscussionSchema = z.object({ title, body, grade, category, links, clientToken: uuid });
export const updateDiscussionSchema = z.object({ id: uuid, title, body, links });
export const createReplySchema = z.object({ discussionId: uuid, body: replyBody, clientToken: uuid });
export const updateReplySchema = z.object({ id: uuid, body: replyBody });
export const idSchema = uuid;

const reportReason = z
  .string({ required_error: "Choose a reason.", invalid_type_error: "Choose a reason." })
  .refine((s) => REPORT_REASONS.some((r) => r.value === s), "Choose a reason from the list.");

const reportDescription = z
  .string({ invalid_type_error: "The details are not valid." })
  .max(RAW_CAP, "That is too long.")
  .optional()
  .transform((v) => cleanText(v ?? ""))
  .pipe(z.string().max(REPORT_DESCRIPTION_MAX, `Details must be ${REPORT_DESCRIPTION_MAX.toLocaleString("en-US")} characters or fewer.`))
  .transform((v) => (v === "" ? null : v));

/**
 * Who is reporting is never part of this input: the server action reads it from the session. Unknown keys are dropped.
 * "Something else" has to be explained, mirroring the CHECK constraint in the database.
 */
export const createReportSchema = z
  .object({
    contentType: z.enum(["discussion", "reply"], { errorMap: () => ({ message: "Invalid request. Please reload the page." }) }),
    contentId: uuid,
    reason: reportReason,
    description: reportDescription,
  })
  .superRefine((v, ctx) => {
    if (v.reason === "other" && (v.description?.length ?? 0) < REPORT_OTHER_MIN) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["description"], message: `Please explain what is wrong (at least ${REPORT_OTHER_MIN} characters).` });
    }
  });
const moderatorNote = z
  .string({ invalid_type_error: "The note is not valid." })
  .max(RAW_CAP, "That is too long.")
  .optional()
  .transform((v) => cleanText(v ?? ""))
  .pipe(z.string().max(NOTE_MAX, `A note must be ${NOTE_MAX.toLocaleString("en-US")} characters or fewer.`))
  .transform((v) => (v === "" ? null : v));

/**
 * Moderation input. There is deliberately NO moderator id: the database takes it from the session. The only statuses
 * a moderator can choose are the three below ("pending" can never be chosen), and hiding is only valid with "action_taken".
 */
export const moderateReportSchema = z
  .object({
    reportId: uuid,
    status: z.enum(["reviewed", "dismissed", "action_taken"], { errorMap: () => ({ message: "Choose a valid new status." }) }),
    note: moderatorNote,
    hideContent: z.boolean().optional().default(false),
  })
  .superRefine((v, ctx) => {
    if (v.hideContent && v.status !== "action_taken") {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["hideContent"], message: 'Content can only be hidden when the report is marked "action taken".' });
    }
  });
export const restoreContentSchema = z.object({ reportId: uuid, note: moderatorNote });
export type ModerateReportInput = z.input<typeof moderateReportSchema>;

export type CreateReportInput = z.input<typeof createReportSchema>;
/** Likes and bookmarks are set-style (idempotent): the browser says what state it wants, never a user id. */
export const setDiscussionLikeSchema = z.object({ discussionId: uuid, liked: z.boolean() });
export const setReplyLikeSchema = z.object({ replyId: uuid, liked: z.boolean() });
export const setDiscussionBookmarkSchema = z.object({ discussionId: uuid, bookmarked: z.boolean() });

export type CreateDiscussionInput = z.input<typeof createDiscussionSchema>;
export type UpdateDiscussionInput = z.input<typeof updateDiscussionSchema>;
export type CreateReplyInput = z.input<typeof createReplySchema>;
export type UpdateReplyInput = z.input<typeof updateReplySchema>;

export function fieldErrorsFrom(error: ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}
