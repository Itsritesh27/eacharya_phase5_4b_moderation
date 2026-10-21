import { describe, expect, it } from "vitest";
import { describeRpcError } from "./attempt-log";

describe("describeRpcError", () => {
  it("includes code and message outside production", () => {
    expect(describeRpcError("submit_attempt", { code: "42703", message: "no field x" }, false)).toBe(
      "[attempt:submit_attempt] database error code=42703 message=no field x",
    );
  });
  it("logs only the code in production", () => {
    const out = describeRpcError("submit_attempt", { code: "42703", message: "secret detail" }, true);
    expect(out).toBe("[attempt:submit_attempt] database error code=42703");
  });
  it("truncates long messages and handles missing fields", () => {
    expect(describeRpcError("x", { message: "a".repeat(1000) }, false).length).toBeLessThan(400);
    expect(describeRpcError("x", {}, false)).toContain("code=unknown");
  });
});
