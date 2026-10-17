import { describe, expect, it } from "vitest";
import { canAccessDashboard, dashboardPathForRole, isRole, redirectTargetFor } from "./roles";

describe("isRole", () => {
  it("accepts only the three known roles", () => {
    expect(isRole("student")).toBe(true);
    expect(isRole("teacher")).toBe(true);
    expect(isRole("admin")).toBe(true);
    expect(isRole("superadmin")).toBe(false);
    expect(isRole("")).toBe(false);
    expect(isRole(undefined)).toBe(false);
  });
});

describe("role-based route protection", () => {
  it("sends signed-out visitors to sign-in", () => {
    expect(redirectTargetFor(null, "student")).toBe("/sign-in");
    expect(redirectTargetFor(null, "admin")).toBe("/sign-in");
  });

  it("lets each role into its own dashboard", () => {
    expect(redirectTargetFor("student", "student")).toBeNull();
    expect(redirectTargetFor("teacher", "teacher")).toBeNull();
    expect(redirectTargetFor("admin", "admin")).toBeNull();
  });

  it("blocks students from teacher and admin areas", () => {
    expect(canAccessDashboard("student", "teacher")).toBe(false);
    expect(canAccessDashboard("student", "admin")).toBe(false);
    expect(redirectTargetFor("student", "admin")).toBe("/dashboard/student");
  });

  it("does not give teachers implicit admin access", () => {
    expect(canAccessDashboard("teacher", "admin")).toBe(false);
    expect(redirectTargetFor("teacher", "admin")).toBe("/dashboard/teacher");
  });

  it("never redirects a role to a page that would redirect it again (no loops)", () => {
    for (const role of ["student", "teacher", "admin"] as const) {
      const home = dashboardPathForRole(role);
      expect(home).toBe(`/dashboard/${role}`);
      expect(redirectTargetFor(role, role)).toBeNull();
    }
  });
});
