import type { Role } from "@/types/app";
import { REPORT_REASONS, type ReportContentType, type ReportReason } from "./report-reasons";

export const MODERATION_PATH = "/dashboard/admin/forum-reports";
export const NOTE_MAX = 1000;
export const MODERATION_PAGE_SIZE = 10;

/**
 * Who may moderate the forum. ADMINS ONLY: the existing role model is strict (no implicit access across dashboards)
 * and has no moderator role. The database enforces the same rule in can_moderate_forum(); change both together to
 * widen it. This list is only a first, friendly check: the database is the authority.
 */
export const FORUM_MODERATOR_ROLES: readonly Role[] = ["admin"];

export function canModerateForum(role: Role | null | undefined): boolean {
  return role != null && FORUM_MODERATOR_ROLES.includes(role);
}

export const REPORT_STATUSES = [
  { value: "pending", label: "Pending" },
  { value: "reviewed", label: "Reviewed" },
  { value: "dismissed", label: "Dismissed" },
  { value: "action_taken", label: "Action taken" },
] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number]["value"];

/** Mirrors forum_moderate_report(): dismissed and action_taken are final. */
export const ALLOWED_TRANSITIONS: Record<ReportStatus, readonly ReportStatus[]> = {
  pending: ["reviewed", "dismissed", "action_taken"],
  reviewed: ["dismissed", "action_taken"],
  dismissed: [],
  action_taken: [],
};

export function isAllowedTransition(from: ReportStatus, to: ReportStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function statusLabel(s: string): string {
  return REPORT_STATUSES.find((x) => x.value === s)?.label ?? "Unknown";
}

export type ReportSort = "newest" | "oldest";
export interface ReportFilters {
  status?: ReportStatus;
  type?: ReportContentType;
  reason?: ReportReason;
  sort: ReportSort;
  page: number;
}

export const parseStatusFilter = (v: string | undefined): ReportStatus | undefined => REPORT_STATUSES.find((s) => s.value === v)?.value;
export const parseTypeFilter = (v: string | undefined): ReportContentType | undefined => (v === "discussion" || v === "reply" ? v : undefined);
export const parseReasonFilter = (v: string | undefined): ReportReason | undefined => REPORT_REASONS.find((r) => r.value === v)?.value;
export const parseReportSort = (v: string | undefined): ReportSort => (v === "oldest" ? "oldest" : "newest");

/** Pending is what moderators need first, so it is the default view. An explicit "all" removes the status filter. */
export function parseStatusParam(v: string | undefined): ReportStatus | undefined {
  return v === "all" ? undefined : (parseStatusFilter(v) ?? "pending");
}

export function moderationHref(f: Partial<ReportFilters>): string {
  const p = new URLSearchParams();
  if (f.status === undefined) p.set("status", "all");
  else if (f.status !== "pending") p.set("status", f.status);
  if (f.type) p.set("type", f.type);
  if (f.reason) p.set("reason", f.reason);
  if (f.sort && f.sort !== "newest") p.set("sort", f.sort);
  if (f.page && f.page > 1) p.set("page", String(f.page));
  const s = p.toString();
  return s ? `${MODERATION_PATH}?${s}` : MODERATION_PATH;
}
