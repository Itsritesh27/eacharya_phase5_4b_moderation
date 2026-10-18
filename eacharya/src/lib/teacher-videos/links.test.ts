import { describe, expect, it } from "vitest";
import { cleanTitle, extractVideoLinks, parseOembed, titleFromFilename, youtubeThumbnail } from "./links";

const A = "dQw4w9WgXcQ";
const B = "9bZkp7q19f0";

describe("extractVideoLinks", () => {
  it("accepts several links separated by newlines, spaces or commas", () => {
    const { links, rejected } = extractVideoLinks(
      `https://www.youtube.com/watch?v=${A}\nhttps://youtu.be/${B}, https://example.com/a.mp4`,
    );
    expect(links.map((l) => l.url)).toEqual([
      `https://www.youtube.com/watch?v=${A}`,
      `https://www.youtube.com/watch?v=${B}`,
      "https://example.com/a.mp4",
    ]);
    expect(rejected).toEqual([]);
  });

  it("treats different forms of the same YouTube video as one", () => {
    const { links, duplicates } = extractVideoLinks(
      `https://www.youtube.com/watch?v=${A}&t=30s https://youtu.be/${A} https://youtube.com/shorts/${A}`,
    );
    expect(links).toHaveLength(1);
    expect(duplicates).toBe(2);
  });

  it("rejects unsupported or unsafe links and plain words", () => {
    const { links, rejected } = extractVideoLinks(
      "http://www.youtube.com/watch?v=dQw4w9WgXcQ javascript:alert(1) https://vimeo.com/123 hello",
    );
    expect(links).toHaveLength(0);
    expect(rejected).toHaveLength(4);
  });
});

describe("titles", () => {
  it("cleans whitespace and caps length", () => {
    expect(cleanTitle("  Rivers \n of   India ")).toBe("Rivers of India");
    expect(cleanTitle("x".repeat(500))).toHaveLength(200);
    expect(cleanTitle(42)).toBe("");
  });

  it("builds a readable fallback title from a file name", () => {
    expect(titleFromFilename("https://cdn.example.com/v/river-systems_part-1.mp4")).toBe("river systems part 1");
  });

  it("reads title and channel from oEmbed JSON", () => {
    expect(parseOembed({ title: " Monsoon Winds ", author_name: "Geo Class" })).toEqual({
      title: "Monsoon Winds",
      author: "Geo Class",
    });
    expect(parseOembed({ author_name: "x" })).toBeNull();
    expect(parseOembed(null)).toBeNull();
  });

  it("uses the public thumbnail host", () => {
    expect(youtubeThumbnail(A)).toBe(`https://i.ytimg.com/vi/${A}/mqdefault.jpg`);
  });
});
