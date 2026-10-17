import { describe, expect, it } from "vitest";
import { availability, describeRules } from "./availability";

const now = new Date("2026-10-17T10:00:00Z");

describe("availability", () => {
  it("is open with no window", () => expect(availability(null, null, now)).toBe("open"));
  it("is upcoming before opens_at", () => expect(availability("2026-10-18T00:00:00Z", null, now)).toBe("upcoming"));
  it("opens exactly at opens_at", () => expect(availability("2026-10-17T10:00:00Z", null, now)).toBe("open"));
  it("closes exactly at closes_at", () => expect(availability(null, "2026-10-17T10:00:00Z", now)).toBe("closed"));
  it("is open inside the window", () =>
    expect(availability("2026-10-17T09:00:00Z", "2026-10-17T11:00:00Z", now)).toBe("open"));
});

describe("describeRules", () => {
  const fmt = (s: string) => s;
  it("covers unlimited attempts and no time limit", () => {
    const r = describeRules({ durationMinutes: null, attemptLimit: null, opensAt: null, closesAt: null }, fmt);
    expect(r).toEqual(["There is no time limit.", "You may attempt this assessment as many times as you like."]);
  });
  it("covers limits and window", () => {
    const r = describeRules({ durationMinutes: 30, attemptLimit: 1, opensAt: "a", closesAt: "b" }, fmt);
    expect(r).toEqual(["You have 30 minutes.", "You may attempt this assessment once.", "Opens a.", "Closes b."]);
  });
});
