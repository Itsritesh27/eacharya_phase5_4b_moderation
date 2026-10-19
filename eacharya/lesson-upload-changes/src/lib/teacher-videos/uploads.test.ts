import { describe, expect, it } from "vitest";
import {
  buildStoragePath,
  checkUploadFile,
  isOwnUploadUrl,
  MAX_UPLOAD_BYTES,
  pathFromPublicUrl,
  publicUrlFor,
  safeFileName,
} from "./uploads";

const SB = "https://abc.supabase.co";
const UID = "11111111-1111-4111-8111-111111111111";

describe("checkUploadFile", () => {
  it("accepts video files and rejects everything else", () => {
    expect(checkUploadFile({ name: "a.MP4", size: 10 })).toBeNull();
    expect(checkUploadFile({ name: "a.pdf", size: 10 })).toMatch(/not a supported video/);
    expect(checkUploadFile({ name: "a.mp4", size: 0 })).toMatch(/empty/);
    expect(checkUploadFile({ name: "a.mp4", size: MAX_UPLOAD_BYTES + 1 })).toMatch(/larger/);
  });
});

describe("safeFileName / buildStoragePath", () => {
  it("makes names URL-safe and keeps the extension", () => {
    expect(safeFileName("नदी तंत्र (Part 1).mp4")).toBe("Part-1.mp4");
    expect(safeFileName("../../x y.webm")).toBe("x-y.webm");
    expect(buildStoragePath(UID, "unit", "A b.mp4", "k1")).toBe(`${UID}/unit/k1-A-b.mp4`);
  });
});

describe("isOwnUploadUrl", () => {
  const path = buildStoragePath(UID, "u", "a.mp4", "k");
  const url = publicUrlFor(SB, path);
  it("accepts a file in the teacher's own folder", () => {
    expect(isOwnUploadUrl(url, SB, UID)).toBe(true);
    expect(pathFromPublicUrl(url)).toBe(path);
  });
  it("rejects other folders, hosts and buckets", () => {
    expect(isOwnUploadUrl(url, SB, "22222222-2222-4222-8222-222222222222")).toBe(false);
    expect(isOwnUploadUrl(url.replace("abc.", "evil."), SB, UID)).toBe(false);
    expect(isOwnUploadUrl(url.replace("lesson-videos", "resources"), SB, UID)).toBe(false);
    expect(isOwnUploadUrl("not a url", SB, UID)).toBe(false);
  });
});
