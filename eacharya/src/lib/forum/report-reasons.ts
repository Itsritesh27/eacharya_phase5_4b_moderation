/** Report reasons. Slugs are stored in forum_reports.reason, where a CHECK constraint enforces the same list. */
export const REPORT_REASONS = [
  { value: "spam", label: "Spam or advertising", hint: "Unwanted promotion, repeated posts or junk links." },
  { value: "abusive", label: "Abusive or harassing", hint: "Insults, bullying or threats towards someone." },
  { value: "inappropriate", label: "Inappropriate content", hint: "Not suitable for a school learning community." },
  { value: "off_topic", label: "Off topic", hint: "Not about Geography or learning." },
  { value: "misinformation", label: "Incorrect or misleading", hint: "Facts that are wrong in a way that could confuse learners." },
  { value: "other", label: "Something else", hint: "Please explain in the details box." },
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number]["value"];
export type ReportContentType = "discussion" | "reply";

export const REPORT_DESCRIPTION_MAX = 1000;
export const REPORT_OTHER_MIN = 5;

export function reasonLabel(value: string): string {
  return REPORT_REASONS.find((r) => r.value === value)?.label ?? "Other";
}
