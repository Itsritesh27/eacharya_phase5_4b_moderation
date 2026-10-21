import { describe, expect, it } from "vitest";
import { CSV_LIMITS, detectDelimiter, parseCsv } from "./csv";
import { formatNumber, parseCellNumber } from "./numbers";

describe("parseCsv", () => {
  it("parses a simple file", () => {
    const r = parseCsv("country,value\nIndia,10\nChina,20\n");
    expect(r.ok && r.data.headers).toEqual(["country", "value"]);
    expect(r.ok && r.data.rows).toEqual([["India", "10"], ["China", "20"]]);
  });
  it("handles quotes, doubled quotes, commas and newlines inside quotes, BOM and CRLF", () => {
    const r = parseCsv('\uFEFFname,note\r\n"Korea, South","said ""hi"""\r\n"Multi\nline",x\r\n');
    expect(r.ok && r.data.rows).toEqual([["Korea, South", 'said "hi"'], ["Multi\nline", "x"]]);
  });
  it("detects semicolon and tab delimiters", () => {
    expect(detectDelimiter("a;b;c\n1;2;3")).toBe(";");
    expect(detectDelimiter("a\tb\n1\t2")).toBe("\t");
    expect(detectDelimiter('"a,b";c\n1;2')).toBe(";");
    const r = parseCsv("a;b\n1;2");
    expect(r.ok && r.data.rows).toEqual([["1", "2"]]);
  });
  it("skips blank lines, pads short rows, skips and reports over-long rows", () => {
    const r = parseCsv("a,b\n\n1\n2,3\n4,5,6\n");
    expect(r.ok && r.data.rows).toEqual([["1", ""], ["2", "3"]]);
    expect(r.ok && r.data.warnings[0]).toMatch(/Line 5 has 3 values/);
  });
  it("makes header names unique and fills blanks", () => {
    const r = parseCsv("a,a,\n1,2,3");
    expect(r.ok && r.data.headers).toEqual(["a", "a (2)", "Column 3"]);
  });
  it("records source line numbers", () => {
    const r = parseCsv("a\n1\n\n2");
    expect(r.ok && r.data.lineNumbers).toEqual([2, 4]);
  });
  it("rejects empty, header-only, binary, unterminated-quote and oversized input", () => {
    expect(parseCsv("   ").ok).toBe(false);
    expect(parseCsv("a,b\n").ok).toBe(false);
    expect(parseCsv("a,b\n1,\u0000").ok).toBe(false);
    const q = parseCsv('a,b\n"open,1');
    expect(!q.ok && q.error).toMatch(/quote/i);
    const rows = "a\n" + Array.from({ length: CSV_LIMITS.maxRows + 1 }, (_, i) => String(i)).join("\n");
    const big = parseCsv(rows);
    expect(!big.ok && big.error).toMatch(/Too many rows/);
    expect(parseCsv("a\n" + "x".repeat(CSV_LIMITS.maxCellLength + 1)).ok).toBe(false);
    expect(parseCsv(Array.from({ length: CSV_LIMITS.maxColumns + 1 }, (_, i) => `c${i}`).join(",") + "\n1").ok).toBe(false);
  });
  it("accepts exactly the row limit", () => {
    const rows = "a\n" + Array.from({ length: CSV_LIMITS.maxRows }, (_, i) => String(i)).join("\n");
    const r = parseCsv(rows);
    expect(r.ok && r.data.rows.length).toBe(CSV_LIMITS.maxRows);
  });
  it("keeps formula-looking and HTML-looking text as inert strings", () => {
    const r = parseCsv('a,b\n=1+1,<img src=x onerror=alert(1)>\n');
    expect(r.ok && r.data.rows[0]).toEqual(["=1+1", "<img src=x onerror=alert(1)>"]);
  });
});

describe("parseCellNumber", () => {
  it("accepts plain, signed, decimal, exponent and thousands-separated numbers", () => {
    for (const [s, v] of [["12", 12], ["-3.5", -3.5], [".5", 0.5], ["1e3", 1000], ["1,234,567", 1234567], [" 7 ", 7], ["+2", 2]] as const) {
      expect(parseCellNumber(s)).toEqual({ kind: "number", value: v });
    }
  });
  it("treats blanks and NA markers as missing", () => {
    for (const s of ["", "  ", "NA", "n/a", "NaN", "null", "-", ".."]) expect(parseCellNumber(s).kind).toBe("missing");
  });
  it("rejects text, units, partial numbers and out-of-range values", () => {
    for (const s of ["abc", "12abc", "12%", "1,2", "1.2.3", "Infinity", "0x10", "12 000", "1e999", "1e20"]) {
      expect(parseCellNumber(s).kind).toBe("invalid");
    }
    expect(parseCellNumber("12%")).toEqual({ kind: "invalid", reason: "remove the % sign" });
  });
  it("formats with Indian grouping", () => {
    expect(formatNumber(1366417754)).toBe("1,36,64,17,754");
    expect(formatNumber(3.14159)).toBe("3.14");
    expect(formatNumber(2.5, 0)).toBe("3");
    expect(formatNumber(9.5)).toBe("9.5");
    expect(formatNumber(12.345)).toBe("12.35");
    expect(formatNumber(12.5, 2)).toBe("12.50");
  });
});
