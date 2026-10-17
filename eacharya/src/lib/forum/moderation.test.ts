import { describe, expect, it } from "vitest";
import { canAccessDashboard } from "@/lib/auth/roles";
import {
  ALLOWED_TRANSITIONS, FORUM_MODERATOR_ROLES, MODERATION_PATH, REPORT_STATUSES, canModerateForum, isAllowedTransition,
  moderationHref, parseReasonFilter, parseReportSort, parseStatusFilter, parseStatusParam, parseTypeFilter, statusLabel,
} from "./moderation";

describe("who may moderate", () => {
  it("is admin only: students, teachers and signed-out users cannot", () => {
    expect(FORUM_MODERATOR_ROLES).toEqual(["admin"]);
    expect(canModerateForum("admin")).toBe(true);
    for (const r of ["student", "teacher", null, undefined] as const) expect(canModerateForum(r)).toBe(false);
  });
  it("matches the existing strict dashboard rule for the route's home (admin area)", () => {
    expect(canAccessDashboard("admin", "admin")).toBe(true);
    expect(canAccessDashboard("teacher", "admin")).toBe(false);
    expect(canAccessDashboard("student", "admin")).toBe(false);
    expect(MODERATION_PATH.startsWith("/dashboard/admin/")).toBe(true);
  });
});

describe("status transitions", () => {
  it("allows only the forward moves the database allows", () => {
    expect(ALLOWED_TRANSITIONS.pending).toEqual(["reviewed", "dismissed", "action_taken"]);
    expect(ALLOWED_TRANSITIONS.reviewed).toEqual(["dismissed", "action_taken"]);
    expect(isAllowedTransition("pending", "reviewed")).toBe(true);
    expect(isAllowedTransition("reviewed", "action_taken")).toBe(true);
  });
  it("treats dismissed and action_taken as final and never allows going back or staying put", () => {
    for (const to of REPORT_STATUSES.map((s) => s.value)) {
      expect(isAllowedTransition("dismissed", to)).toBe(false);
      expect(isAllowedTransition("action_taken", to)).toBe(false);
      expect(isAllowedTransition(to, "pending")).toBe(false);
      expect(isAllowedTransition(to, to)).toBe(false);
    }
  });
  it("labels statuses and tolerates unknown ones", () => {
    expect(statusLabel("action_taken")).toBe("Action taken");
    expect(statusLabel("zzz")).toBe("Unknown");
  });
});

describe("queue parameters", () => {
  it("defaults to pending, and 'all' removes the status filter", () => {
    expect(parseStatusParam(undefined)).toBe("pending");
    expect(parseStatusParam("bogus")).toBe("pending");
    expect(parseStatusParam("all")).toBeUndefined();
    expect(parseStatusParam("dismissed")).toBe("dismissed");
    expect(parseStatusFilter("x")).toBeUndefined();
  });
  it("accepts only known types, reasons and sorts", () => {
    expect(parseTypeFilter("reply")).toBe("reply");
    for (const bad of [undefined, "", "post", "REPLY"]) expect(parseTypeFilter(bad)).toBeUndefined();
    expect(parseReasonFilter("spam")).toBe("spam");
    for (const bad of [undefined, "", "bogus", "spam;drop"]) expect(parseReasonFilter(bad)).toBeUndefined();
    expect(parseReportSort("oldest")).toBe("oldest");
    for (const bad of [undefined, "", "newest", "random"]) expect(parseReportSort(bad)).toBe("newest");
  });
  it("builds hrefs that keep filters and page, and omit defaults", () => {
    expect(moderationHref({ status: "pending", sort: "newest", page: 1 })).toBe(MODERATION_PATH);
    expect(moderationHref({ status: undefined, sort: "newest" })).toBe(`${MODERATION_PATH}?status=all`);
    expect(moderationHref({ status: "reviewed", type: "reply", reason: "spam", sort: "oldest", page: 3 }))
      .toBe(`${MODERATION_PATH}?status=reviewed&type=reply&reason=spam&sort=oldest&page=3`);
  });
});
