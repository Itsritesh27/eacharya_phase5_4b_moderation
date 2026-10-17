/** Strict numeric parsing for uploaded cells. Never uses eval, Function or parseFloat's lenient prefix parsing. */
export type CellNumber =
  | { kind: "number"; value: number }
  | { kind: "missing" }
  | { kind: "invalid"; reason: string };

const MISSING = new Set(["", "na", "n/a", "nan", "null", "none", "-", "--", "…", "..", "nil"]);
const PLAIN = /^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/;
const THOUSANDS = /^[+-]?\d{1,3}(,\d{3})+(\.\d+)?$/;
export const MAX_ABS_VALUE = 1e15;

export function parseCellNumber(raw: string): CellNumber {
  const s = raw.trim();
  if (MISSING.has(s.toLowerCase())) return { kind: "missing" };
  let candidate = s;
  if (THOUSANDS.test(s)) candidate = s.replace(/,/g, "");
  if (!PLAIN.test(candidate)) {
    return { kind: "invalid", reason: /%$/.test(s) ? "remove the % sign" : "not a number" };
  }
  const value = Number(candidate);
  if (!Number.isFinite(value) || Math.abs(value) > MAX_ABS_VALUE) return { kind: "invalid", reason: "number out of range" };
  return { kind: "number", value };
}

/** Locale used for every number shown in the studio (Indian digit grouping, matching the curriculum context). */
export function formatNumber(value: number, decimals?: number): string {
  // With no explicit decimals, show up to 2 (fewer for large numbers) and drop trailing zeros: 9.5, not 9.50.
  const max = decimals ?? (Number.isInteger(value) || Math.abs(value) >= 100 ? 0 : 2);
  const min = decimals ?? 0;
  return new Intl.NumberFormat("en-IN", { minimumFractionDigits: min, maximumFractionDigits: max }).format(value);
}
