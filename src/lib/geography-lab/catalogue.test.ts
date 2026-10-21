import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LAB_GRADES, LAB_TOOLS, STARTER_ACTIVITIES, activitiesForGrade, parseGrade } from "./catalogue";

describe("lab catalogue", () => {
  it("has unique activity ids and sane durations", () => {
    const ids = STARTER_ACTIVITIES.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const a of STARTER_ACTIVITIES) {
      expect(a.minutes).toBeGreaterThan(0);
      expect(a.title && a.topic && a.objective).toBeTruthy();
    }
  });
  it("covers every class", () => {
    for (const g of LAB_GRADES) expect(activitiesForGrade(g).length).toBeGreaterThan(0);
  });
  it("only links tools to same-page anchors or routes that really exist", () => {
    for (const t of LAB_TOOLS) {
      if (!t.href) continue;
      if (t.href.startsWith("#")) expect(t.href).toMatch(/^#[a-z-]+$/);
      else expect(existsSync(join(process.cwd(), "src/app", t.href, "page.tsx"))).toBe(true);
    }
    expect(LAB_TOOLS).toHaveLength(7);
  });
  it("parses grade safely", () => {
    expect(parseGrade("10")).toBe(10);
    for (const bad of [undefined, "", "8", "13", "abc", "9.5", "<script>"]) expect(parseGrade(bad)).toBeUndefined();
  });
  it("returns all activities with no grade", () => {
    expect(activitiesForGrade(undefined)).toHaveLength(STARTER_ACTIVITIES.length);
  });
});
