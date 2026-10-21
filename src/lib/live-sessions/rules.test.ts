import { describe, expect, it } from "vitest";
import { formatDuration, joinDecision, joinState, type SessionTiming } from "./rules";
import { scheduleSchema } from "./validation";

const START = new Date("2026-11-01T10:00:00Z");
const at = (mins: number) => new Date(START.getTime() + mins * 60_000);
const session = (over: Partial<SessionTiming> = {}): SessionTiming => ({
  startsAt: START, durationMinutes: 60, status: "scheduled", ...over,
});

describe("joinDecision", () => {
  it("blocks students more than 10 minutes early, allows from 10 minutes before", () => {
    expect(joinDecision(session(), "participant", at(-11)).ok).toBe(false);
    expect(joinDecision(session(), "participant", at(-10)).ok).toBe(true);
  });
  it("allows students until 30 minutes after the end", () => {
    expect(joinDecision(session(), "participant", at(60 + 30)).ok).toBe(true);
    expect(joinDecision(session(), "participant", at(60 + 31)).ok).toBe(false);
  });
  it("keeps a started (live) class open for late students", () => {
    expect(joinDecision(session({ status: "live" }), "participant", at(200)).ok).toBe(true);
  });
  it("lets the host open the room up to an hour early", () => {
    expect(joinDecision(session(), "host", at(-61)).ok).toBe(false);
    expect(joinDecision(session(), "host", at(-60)).ok).toBe(true);
  });
  it("refuses cancelled and ended classes for everyone", () => {
    for (const status of ["cancelled", "ended"] as const) {
      expect(joinDecision(session({ status }), "host", at(0)).ok).toBe(false);
      expect(joinDecision(session({ status }), "participant", at(0)).ok).toBe(false);
    }
  });
});

describe("joinState", () => {
  it("labels the lifecycle", () => {
    expect(joinState(session(), at(-120))).toBe("upcoming");
    expect(joinState(session(), at(-5))).toBe("open");
    expect(joinState(session({ status: "live" }), at(5))).toBe("live");
    expect(joinState(session(), at(500))).toBe("over");
    expect(joinState(session({ status: "cancelled" }), at(0))).toBe("cancelled");
  });
});

describe("formatDuration", () => {
  it("formats stays", () => {
    expect(formatDuration(0)).toBe("0 min");
    expect(formatDuration(20)).toBe("<1 min");
    expect(formatDuration(2700)).toBe("45 min");
    expect(formatDuration(3600)).toBe("1 h");
    expect(formatDuration(5400)).toBe("1 h 30 min");
  });
});

describe("scheduleSchema", () => {
  const good = {
    courseId: "5b7f6a56-1d7c-4bde-9d8c-1b2f3a4c5d6e",
    title: "  Rivers   of India ",
    description: "",
    startsAt: "2026-11-01T10:00:00Z",
    durationMinutes: "45",
  };
  it("normalises valid input", () => {
    const r = scheduleSchema.parse(good);
    expect(r.title).toBe("Rivers of India");
    expect(r.durationMinutes).toBe(45);
    expect(r.startsAt).toBe("2026-11-01T10:00:00.000Z");
  });
  it("rejects bad input", () => {
    expect(scheduleSchema.safeParse({ ...good, title: "ab" }).success).toBe(false);
    expect(scheduleSchema.safeParse({ ...good, durationMinutes: 5 }).success).toBe(false);
    expect(scheduleSchema.safeParse({ ...good, durationMinutes: 999 }).success).toBe(false);
    expect(scheduleSchema.safeParse({ ...good, startsAt: "nope" }).success).toBe(false);
    expect(scheduleSchema.safeParse({ ...good, courseId: "x" }).success).toBe(false);
  });
});
