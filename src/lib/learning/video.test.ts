import { describe, expect, it } from "vitest";
import { parseVideoUrl } from "./video";
import { validateExternalUrl } from "./external-url";

describe("parseVideoUrl", () => {
  it("accepts common YouTube formats and rebuilds a safe embed URL", () => {
    const id = "dQw4w9WgXcQ";
    const expected = `https://www.youtube-nocookie.com/embed/${id}`;
    for (const url of [
      `https://www.youtube.com/watch?v=${id}`,
      `https://youtu.be/${id}`,
      `https://www.youtube.com/embed/${id}`,
      `https://youtube.com/shorts/${id}`,
    ]) {
      const r = parseVideoUrl(url);
      expect(r?.kind).toBe("youtube");
      if (r?.kind === "youtube") expect(r.embedUrl).toBe(expected);
    }
  });

  it("does not pass through extra query parameters or paths", () => {
    const r = parseVideoUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ&autoplay=1&x=<script>");
    expect(r?.kind === "youtube" && r.embedUrl).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
  });

  it("accepts https direct video files", () => {
    expect(parseVideoUrl("https://cdn.example.com/lesson.mp4")).toEqual({
      kind: "direct",
      src: "https://cdn.example.com/lesson.mp4",
      mime: "video/mp4",
      qualities: [{ label: "Original", height: 0, src: "https://cdn.example.com/lesson.mp4", mime: "video/mp4" }],
    });
    expect(parseVideoUrl("https://cdn.example.com/a/b.WEBM")?.kind).toBe("direct");
  });

  it("rejects unsafe or unsupported URLs", () => {
    for (const url of [
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "http://cdn.example.com/lesson.mp4", // not https
      "https://evil.example.com/page.html", // arbitrary page: never iframe it
      "https://www.youtube.com.evil.com/watch?v=dQw4w9WgXcQ", // lookalike host
      "https://www.youtube.com/watch?v=short", // bad id
      "https://user:pass@cdn.example.com/lesson.mp4",
      "not a url",
      "",
    ]) {
      expect(parseVideoUrl(url)).toBeNull();
    }
    expect(parseVideoUrl(null)).toBeNull();
  });
});

describe("validateExternalUrl", () => {
  it("accepts http and https and reports the host", () => {
    expect(validateExternalUrl("https://www.ncert.nic.in/textbook")).toEqual({
      href: "https://www.ncert.nic.in/textbook",
      host: "ncert.nic.in",
    });
    expect(validateExternalUrl("http://example.org/a")?.host).toBe("example.org");
  });

  it("rejects unsafe schemes and credentials", () => {
    for (const url of [
      "javascript:alert(1)",
      "data:text/html,hi",
      "file:///etc/passwd",
      "vbscript:msgbox(1)",
      "https://user:pw@example.org",
      "//example.org",
      "localhost",
      "",
    ]) {
      expect(validateExternalUrl(url)).toBeNull();
    }
  });
});
