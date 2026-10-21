import { describe, expect, it } from "vitest";
import {
  ATTEMPT_GENERIC_ERROR,
  attemptErrorMessage,
  attemptIdSchema,
  isAttemptOpen,
  mapAttemptInfo,
  mapAttemptRows,
  openAttemptSchema,
  startAttemptSchema,
} from "./attempts";

const ID = "11111111-1111-4111-8111-111111111111";
const AID = "22222222-2222-4222-8222-222222222222";

const raw = (over: Record<string, unknown> = {}) => ({
  attempt_id: ID,
  assessment_id: AID,
  attempt_number: 1,
  status: "in_progress",
  started_at: "2026-10-19T10:00:00+00:00",
  expires_at: "2026-10-19T10:30:00+00:00",
  submitted_at: null,
  server_now: "2026-10-19T10:00:01+00:00",
  seconds_remaining: 1799,
  resumed: false,
  ...over,
});

describe("input schemas", () => {
  it("accepts a UUID assessment id with or without a request key", () => {
    expect(startAttemptSchema.safeParse({ assessmentId: AID }).success).toBe(true);
    expect(startAttemptSchema.safeParse({ assessmentId: AID, requestKey: ID }).success).toBe(true);
  });
  it.each([
    [{}],
    [{ assessmentId: "abc" }],
    [{ assessmentId: AID, requestKey: "not-a-uuid" }],
    [{ assessmentId: 5 }],
    [null],
    ["x"],
  ])("rejects bad start input %j", (input) => {
    expect(startAttemptSchema.safeParse(input).success).toBe(false);
  });
  it("requires UUIDs for attempt and assessment lookups", () => {
    expect(attemptIdSchema.safeParse({ attemptId: ID }).success).toBe(true);
    expect(attemptIdSchema.safeParse({ attemptId: "1 or 1=1" }).success).toBe(false);
    expect(openAttemptSchema.safeParse({ assessmentId: AID }).success).toBe(true);
    expect(openAttemptSchema.safeParse({ assessmentId: "" }).success).toBe(false);
  });
  it("has no field for a user id: a smuggled one is stripped, never forwarded", () => {
    const parsed = startAttemptSchema.parse({ assessmentId: AID, userId: "someone-else", user_id: "x" });
    expect(Object.keys(parsed)).toEqual(["assessmentId"]);
  });
});

describe("mapAttemptInfo", () => {
  it("maps snake_case to camelCase", () => {
    expect(mapAttemptInfo(raw())).toEqual({
      attemptId: ID,
      assessmentId: AID,
      attemptNumber: 1,
      status: "in_progress",
      startedAt: "2026-10-19T10:00:00+00:00",
      expiresAt: "2026-10-19T10:30:00+00:00",
      submittedAt: null,
      serverNow: "2026-10-19T10:00:01+00:00",
      secondsRemaining: 1799,
      resumed: false,
    });
  });
  it("accepts a one-element array as well as an object", () => {
    expect(mapAttemptInfo([raw()])?.attemptId).toBe(ID);
  });
  it("keeps null deadline and null seconds_remaining (untimed attempt)", () => {
    const a = mapAttemptInfo(raw({ expires_at: null, seconds_remaining: null }));
    expect(a?.expiresAt).toBeNull();
    expect(a?.secondsRemaining).toBeNull();
  });
  it("never lets seconds_remaining go negative or fractional", () => {
    expect(mapAttemptInfo(raw({ seconds_remaining: -5 }))?.secondsRemaining).toBe(0);
    expect(mapAttemptInfo(raw({ seconds_remaining: 12.9 }))?.secondsRemaining).toBe(12);
  });
  it("treats anything but resumed === true as not resumed", () => {
    expect(mapAttemptInfo(raw({ resumed: "true" }))?.resumed).toBe(false);
    expect(mapAttemptInfo(raw({ resumed: true }))?.resumed).toBe(true);
  });
  it.each([
    ["null", null],
    ["undefined", undefined],
    ["empty array", []],
    ["a string", "x"],
    ["missing attempt_id", raw({ attempt_id: undefined })],
    ["unknown status", raw({ status: "graded" })],
    ["non-integer attempt number", raw({ attempt_number: 1.5 })],
    ["string attempt number", raw({ attempt_number: "1" })],
    ["missing server_now", raw({ server_now: undefined })],
    ["non-numeric seconds", raw({ seconds_remaining: "30" })],
    ["numeric started_at", raw({ started_at: 5 })],
  ])("fails closed on %s", (_n, input) => {
    expect(mapAttemptInfo(input)).toBeNull();
  });
  it("does not pass through unknown fields (e.g. a future answer or score column)", () => {
    const a = mapAttemptInfo(raw({ score: 9, correct_answers: ["x"], user_id: "u" }));
    expect(a).not.toBeNull();
    expect(Object.keys(a!).sort()).toEqual(
      ["assessmentId", "attemptId", "attemptNumber", "expiresAt", "resumed", "secondsRemaining", "serverNow", "startedAt", "status", "submittedAt"],
    );
  });
});

describe("mapAttemptRows", () => {
  it("returns 0, 1 or many mapped rows and drops malformed ones", () => {
    expect(mapAttemptRows([])).toEqual([]);
    expect(mapAttemptRows(null)).toEqual([]);
    expect(mapAttemptRows([raw()])).toHaveLength(1);
    expect(mapAttemptRows(raw())).toHaveLength(1);
    expect(mapAttemptRows([raw(), { nope: true }])).toHaveLength(1);
  });
});

describe("attemptErrorMessage", () => {
  it.each(["42501", "EA001", "EA002", "EA003", "EA004", "EA005", "EA006", "EA007", "EA008", "EA009"])("has fixed wording for %s", (code) => {
    const m = attemptErrorMessage({ code });
    expect(m).not.toBe(ATTEMPT_GENERIC_ERROR);
    expect(m.length).toBeGreaterThan(10);
  });
  it("never reveals whether an unavailable assessment exists, is a draft or the student is not enrolled", () => {
    expect(attemptErrorMessage({ code: "EA001" })).not.toMatch(/draft|enrol|exist|publish/i);
  });
  it.each([[{ code: "23505" }], [{ code: "XX000" }], [{}], [null], [undefined]])(
    "uses the generic message for unknown error %j (raw database text is never shown)",
    (e) => {
      expect(attemptErrorMessage(e as never)).toBe(ATTEMPT_GENERIC_ERROR);
    },
  );
});

describe("isAttemptOpen", () => {
  it("is open only while in progress with time left (or no deadline)", () => {
    expect(isAttemptOpen({ status: "in_progress", secondsRemaining: 10 })).toBe(true);
    expect(isAttemptOpen({ status: "in_progress", secondsRemaining: null })).toBe(true);
    expect(isAttemptOpen({ status: "in_progress", secondsRemaining: 0 })).toBe(false);
    expect(isAttemptOpen({ status: "expired", secondsRemaining: 0 })).toBe(false);
    expect(isAttemptOpen({ status: "submitted", secondsRemaining: 0 })).toBe(false);
  });
});
