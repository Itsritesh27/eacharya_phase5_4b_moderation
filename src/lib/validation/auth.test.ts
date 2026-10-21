import { describe, expect, it } from "vitest";
import {
  forgotPasswordSchema,
  resetPasswordSchema,
  setUserRoleSchema,
  signInSchema,
  signUpSchema,
} from "./auth";

const validSignUp = {
  fullName: "Aanya Sharma",
  email: "aanya@example.com",
  password: "Geography1",
  confirmPassword: "Geography1",
};

describe("signInSchema", () => {
  it("accepts a valid email and password", () => {
    expect(signInSchema.safeParse({ email: "a@b.co", password: "x" }).success).toBe(true);
  });

  it("rejects an invalid email", () => {
    expect(signInSchema.safeParse({ email: "not-an-email", password: "x" }).success).toBe(false);
  });

  it("rejects an empty password", () => {
    expect(signInSchema.safeParse({ email: "a@b.co", password: "" }).success).toBe(false);
  });
});

describe("signUpSchema", () => {
  it("accepts valid details", () => {
    expect(signUpSchema.safeParse(validSignUp).success).toBe(true);
  });

  it("rejects weak passwords", () => {
    expect(signUpSchema.safeParse({ ...validSignUp, password: "short", confirmPassword: "short" }).success).toBe(false);
    expect(signUpSchema.safeParse({ ...validSignUp, password: "alllowercase1", confirmPassword: "alllowercase1" }).success).toBe(false);
    expect(signUpSchema.safeParse({ ...validSignUp, password: "NoNumbersHere", confirmPassword: "NoNumbersHere" }).success).toBe(false);
  });

  it("rejects mismatched passwords", () => {
    const r = signUpSchema.safeParse({ ...validSignUp, confirmPassword: "Different1" });
    expect(r.success).toBe(false);
  });

  it("strips a forged role field so it can never reach the auth call", () => {
    const r = signUpSchema.safeParse({ ...validSignUp, role: "admin" });
    expect(r.success).toBe(true);
    if (r.success) expect("role" in r.data).toBe(false);
  });
});

describe("password reset schemas", () => {
  it("validates the forgot-password email", () => {
    expect(forgotPasswordSchema.safeParse({ email: "bad" }).success).toBe(false);
    expect(forgotPasswordSchema.safeParse({ email: "a@b.co" }).success).toBe(true);
  });

  it("requires matching strong passwords on reset", () => {
    expect(resetPasswordSchema.safeParse({ password: "Geography1", confirmPassword: "Geography1" }).success).toBe(true);
    expect(resetPasswordSchema.safeParse({ password: "Geography1", confirmPassword: "Geography2" }).success).toBe(false);
  });
});

describe("setUserRoleSchema (admin action input)", () => {
  const uuid = "123e4567-e89b-42d3-a456-426614174000";

  it("accepts known roles", () => {
    expect(setUserRoleSchema.safeParse({ userId: uuid, role: "teacher" }).success).toBe(true);
  });

  it("rejects unknown roles and malformed ids", () => {
    expect(setUserRoleSchema.safeParse({ userId: uuid, role: "superuser" }).success).toBe(false);
    expect(setUserRoleSchema.safeParse({ userId: "1 or 1=1", role: "student" }).success).toBe(false);
  });
});
