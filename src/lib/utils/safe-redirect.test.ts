import { describe, expect, it } from "vitest";
import { safeNext } from "./safe-redirect";

describe("safeNext", () => {
  it("keeps normal in-app paths", () => {
    expect(safeNext("/courses?grade=9")).toBe("/courses?grade=9");
    expect(safeNext("/auth/reset-password")).toBe("/auth/reset-password");
  });

  it("falls back for missing values", () => {
    expect(safeNext(null)).toBe("/dashboard");
    expect(safeNext(undefined)).toBe("/dashboard");
    expect(safeNext("")).toBe("/dashboard");
  });

  it("blocks open redirects", () => {
    expect(safeNext("https://evil.example")).toBe("/dashboard");
    expect(safeNext("//evil.example")).toBe("/dashboard");
    expect(safeNext("/\\evil.example")).toBe("/dashboard");
    expect(safeNext("javascript:alert(1)")).toBe("/dashboard");
  });

  it("never redirects back into the auth pages (prevents loops)", () => {
    expect(safeNext("/sign-in")).toBe("/dashboard");
    expect(safeNext("/sign-up?x=1")).toBe("/dashboard");
  });
});
