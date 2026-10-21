import { describe, expect, it } from "vitest";
import {
  MAX_RESOURCE_BYTES,
  buildResourcePath,
  checkResourceFile,
  isOwnResourcePath,
  resourceKind,
  resourceTitleFromName,
} from "./resource-files";

const UID = "11111111-1111-4111-8111-111111111111";

describe("resource files", () => {
  it("maps extensions to resource types", () => {
    expect(resourceKind("a.PDF")?.type).toBe("pdf");
    expect(resourceKind("a.pptx")?.type).toBe("presentation");
    expect(resourceKind("a.jpeg")?.type).toBe("image");
    expect(resourceKind("a.exe")).toBeNull();
  });
  it("checks size and type", () => {
    expect(checkResourceFile({ name: "a.pdf", size: 5 })).toBeNull();
    expect(checkResourceFile({ name: "a.docx", size: 5 })).toMatch(/not supported/);
    expect(checkResourceFile({ name: "a.pdf", size: MAX_RESOURCE_BYTES + 1 })).toMatch(/larger/);
    expect(checkResourceFile({ name: "a.pdf", size: 0 })).toMatch(/empty/);
  });
  it("builds a path in the teacher's own folder and validates it", () => {
    const p = buildResourcePath(UID, "unit1", "Notes (final).pdf", "k1");
    expect(p).toBe(`${UID}/lessons/unit1/k1-Notes-final.pdf`);
    expect(isOwnResourcePath(p, UID)).toBe(true);
    expect(isOwnResourcePath(p, "22222222-2222-4222-8222-222222222222")).toBe(false);
    expect(isOwnResourcePath(`${UID}/../x.pdf`, UID)).toBe(false);
    expect(isOwnResourcePath(`${UID}/x.exe`, UID)).toBe(false);
  });
  it("makes a readable title", () => {
    expect(resourceTitleFromName("river_systems-notes.pdf")).toBe("river systems notes");
  });
});
