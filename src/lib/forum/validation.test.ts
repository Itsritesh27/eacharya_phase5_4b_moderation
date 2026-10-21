import { describe, expect, it } from "vitest";
import {
  cleanText, cleanTitle, createDiscussionSchema, createReplySchema, createReportSchema, fieldErrorsFrom, moderateReportSchema, restoreContentSchema, normaliseLink,
  splitLinkLines, stripControl, updateDiscussionSchema, updateReplySchema,
} from "./validation";

const TOKEN = "11111111-1111-4111-8111-111111111111";
const valid = {
  title: "Why does the monsoon burst?", body: "Please explain the onset of the monsoon.", grade: 10,
  category: "climate", links: [], clientToken: TOKEN,
};

describe("text cleaning", () => {
  it("removes control characters but keeps tabs and newlines", () => {
    expect(stripControl("a\u0000b\u0007c\td\ne\u007f")).toBe("abc\td\ne");
  });
  it("normalises line endings and trims", () => {
    expect(cleanText("  a\r\nb\rc  ")).toBe("a\nb\nc");
  });
  it("collapses whitespace in titles", () => {
    expect(cleanTitle("  Why \n does   it\train? ")).toBe("Why does it rain?");
  });
});

describe("links", () => {
  it("accepts https only", () => {
    expect(normaliseLink("https://example.org/a")).toBe("https://example.org/a");
    for (const bad of ["http://example.org", "javascript:alert(1)", "data:text/html,x", "ftp://a.org", "https://user:pw@a.org", "https://a b.org", "not a url", "https://localhost", ""]) {
      expect(normaliseLink(bad)).toBeNull();
    }
    expect(normaliseLink(`https://example.org/${"a".repeat(600)}`)).toBeNull();
  });
  it("splits one link per line and ignores blanks", () => {
    expect(splitLinkLines("https://a.org\n\n  https://b.org \r\n")).toEqual(["https://a.org", "https://b.org"]);
  });
});

describe("createDiscussionSchema", () => {
  it("accepts a valid discussion and cleans it", () => {
    const r = createDiscussionSchema.safeParse({ ...valid, title: "  Why   does the monsoon burst?  ", links: [" https://example.org/x ", "https://example.org/x"] });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.title).toBe("Why does the monsoon burst?");
      expect(r.data.links).toEqual(["https://example.org/x"]); // trimmed and de-duplicated
    }
  });
  it("defaults links to an empty list", () => {
    const { links: _l, ...rest } = valid;
    void _l;
    const r = createDiscussionSchema.safeParse(rest);
    expect(r.success && r.data.links).toEqual([]);
  });
  it("rejects bad titles", () => {
    for (const title of ["", "    ", "abcd", "x".repeat(201), "\n\n\n\n\n\n"]) {
      expect(createDiscussionSchema.safeParse({ ...valid, title }).success).toBe(false);
    }
    expect(createDiscussionSchema.safeParse({ ...valid, title: "x".repeat(200) }).success).toBe(true);
  });
  it("rejects bad bodies", () => {
    for (const body of ["", "   \n\t ", "too short", "x".repeat(10001)]) {
      expect(createDiscussionSchema.safeParse({ ...valid, body }).success).toBe(false);
    }
    expect(createDiscussionSchema.safeParse({ ...valid, body: "x".repeat(10000) }).success).toBe(true);
  });
  it("rejects classes outside 9-12 and unknown categories", () => {
    for (const grade of [8, 13, 0, 10.5, "10", null, undefined]) expect(createDiscussionSchema.safeParse({ ...valid, grade }).success).toBe(false);
    for (const category of ["", "Climate", "made-up", undefined, 5]) expect(createDiscussionSchema.safeParse({ ...valid, category }).success).toBe(false);
  });
  it("rejects more than 3 links and unsafe links, reporting them under 'links'", () => {
    const four = createDiscussionSchema.safeParse({ ...valid, links: ["https://a.org", "https://b.org", "https://c.org", "https://d.org"] });
    expect(four.success).toBe(false);
    const bad = createDiscussionSchema.safeParse({ ...valid, links: ["javascript:alert(1)"] });
    expect(bad.success).toBe(false);
    if (!bad.success) expect(fieldErrorsFrom(bad.error).links).toMatch(/https/);
  });
  it("requires a valid idempotency token", () => {
    expect(createDiscussionSchema.safeParse({ ...valid, clientToken: "nope" }).success).toBe(false);
    expect(createDiscussionSchema.safeParse({ ...valid, clientToken: undefined }).success).toBe(false);
  });
  it("drops unknown keys such as an authorId sent from the browser", () => {
    const r = createDiscussionSchema.safeParse({ ...valid, authorId: "attacker", author_id: "attacker", is_hidden: true, role: "teacher" });
    expect(r.success).toBe(true);
    if (r.success) expect(Object.keys(r.data).sort()).toEqual(["body", "category", "clientToken", "grade", "links", "title"]);
  });
  it("reports one message per field", () => {
    const r = createDiscussionSchema.safeParse({ ...valid, title: "", body: "", grade: undefined });
    expect(r.success).toBe(false);
    if (!r.success) expect(Object.keys(fieldErrorsFrom(r.error)).sort()).toEqual(["body", "grade", "title"]);
  });
});

describe("replies and updates", () => {
  const did = "22222222-2222-4222-8222-222222222222";
  it("validates replies", () => {
    expect(createReplySchema.safeParse({ discussionId: did, body: " Thanks! ", clientToken: TOKEN }).success).toBe(true);
    for (const body of ["", "  \n ", "x".repeat(5001)]) expect(createReplySchema.safeParse({ discussionId: did, body, clientToken: TOKEN }).success).toBe(false);
    expect(createReplySchema.safeParse({ discussionId: "not-a-uuid", body: "ok", clientToken: TOKEN }).success).toBe(false);
  });
  it("validates edits with the same rules", () => {
    expect(updateReplySchema.safeParse({ id: did, body: "ok" }).success).toBe(true);
    expect(updateReplySchema.safeParse({ id: did, body: " " }).success).toBe(false);
    expect(updateDiscussionSchema.safeParse({ id: did, title: "A fine title", body: "A long enough body.", links: [] }).success).toBe(true);
    expect(updateDiscussionSchema.safeParse({ id: did, title: "abc", body: "A long enough body." }).success).toBe(false);
  });
});

describe("createReportSchema", () => {
  const ID = "22222222-2222-4222-8222-222222222222";
  const good = { contentType: "discussion", contentId: ID, reason: "spam", description: "  Looks like an advert  " };

  it("accepts a discussion and a reply report and trims the details", () => {
    const d = createReportSchema.parse(good);
    expect(d).toEqual({ contentType: "discussion", contentId: ID, reason: "spam", description: "Looks like an advert" });
    expect(createReportSchema.parse({ ...good, contentType: "reply" }).contentType).toBe("reply");
  });
  it("treats missing or blank details as null", () => {
    expect(createReportSchema.parse({ ...good, description: undefined }).description).toBeNull();
    expect(createReportSchema.parse({ ...good, description: "   \n " }).description).toBeNull();
  });
  it("rejects unknown reasons, content types and ids", () => {
    for (const reason of ["", "bogus", "SPAM", undefined, 5]) expect(createReportSchema.safeParse({ ...good, reason }).success).toBe(false);
    for (const contentType of ["post", "", undefined]) expect(createReportSchema.safeParse({ ...good, contentType }).success).toBe(false);
    expect(createReportSchema.safeParse({ ...good, contentId: "not-a-uuid" }).success).toBe(false);
  });
  it("requires an explanation for 'something else'", () => {
    const r = createReportSchema.safeParse({ ...good, reason: "other", description: "" });
    expect(r.success).toBe(false);
    if (!r.success) expect(Object.keys(fieldErrorsFrom(r.error))).toEqual(["description"]);
    expect(createReportSchema.safeParse({ ...good, reason: "other", description: "Contains a private phone number" }).success).toBe(true);
  });
  it("caps the details length and strips any reporter id sent by the browser", () => {
    expect(createReportSchema.safeParse({ ...good, description: "x".repeat(1001) }).success).toBe(false);
    const d = createReportSchema.parse({ ...good, reporterId: "attacker", reporter_id: "attacker", status: "action_taken" });
    expect(Object.keys(d).sort()).toEqual(["contentId", "contentType", "description", "reason"]);
  });
});

describe("moderateReportSchema", () => {
  const ID = "44444444-4444-4444-8444-444444444444";
  it("accepts the three moderator statuses, with an optional trimmed note", () => {
    for (const status of ["reviewed", "dismissed", "action_taken"]) expect(moderateReportSchema.safeParse({ reportId: ID, status }).success).toBe(true);
    expect(moderateReportSchema.parse({ reportId: ID, status: "dismissed", note: " ok " })).toEqual({ reportId: ID, status: "dismissed", note: "ok", hideContent: false });
    expect(moderateReportSchema.parse({ reportId: ID, status: "dismissed", note: "  " }).note).toBeNull();
  });
  it("never accepts pending, unknown statuses or a bad id", () => {
    for (const status of ["pending", "", "bogus", undefined]) expect(moderateReportSchema.safeParse({ reportId: ID, status }).success).toBe(false);
    expect(moderateReportSchema.safeParse({ reportId: "x", status: "reviewed" }).success).toBe(false);
  });
  it("allows hiding only with action_taken and caps the note", () => {
    expect(moderateReportSchema.safeParse({ reportId: ID, status: "action_taken", hideContent: true }).success).toBe(true);
    expect(moderateReportSchema.safeParse({ reportId: ID, status: "reviewed", hideContent: true }).success).toBe(false);
    expect(moderateReportSchema.safeParse({ reportId: ID, status: "reviewed", note: "x".repeat(1001) }).success).toBe(false);
  });
  it("drops any moderator id sent by the browser", () => {
    const d = moderateReportSchema.parse({ reportId: ID, status: "reviewed", moderatorId: "a", moderator_id: "a" });
    expect(Object.keys(d).sort()).toEqual(["hideContent", "note", "reportId", "status"]);
    expect(Object.keys(restoreContentSchema.parse({ reportId: ID, moderator_id: "a" })).sort()).toEqual(["note", "reportId"]);
  });
});
