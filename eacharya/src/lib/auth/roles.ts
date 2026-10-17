import type { Role } from "@/types/app";

export const ROLES: readonly Role[] = ["student", "teacher", "admin"] as const;

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

/** Each role has exactly one home dashboard. */
export function dashboardPathForRole(role: Role): string {
  return `/dashboard/${role}`;
}

/**
 * Pure access rule used by server guards (and unit-tested).
 * Strict: a role may only enter its own dashboard area. A teacher gets no
 * implicit access to admin pages, and an admin does not impersonate others.
 */
export function canAccessDashboard(role: Role, area: Role): boolean {
  return role === area;
}

/** Where to send someone who requested a dashboard they may not use. */
export function redirectTargetFor(role: Role | null, area: Role): string | null {
  if (role === null) return "/sign-in";
  if (canAccessDashboard(role, area)) return null;
  return dashboardPathForRole(role);
}
