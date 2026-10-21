/**
 * Safe, dependency-free CSV parser for the Thematic Map Studio.
 * Pure string processing: nothing in the file is ever evaluated, and the output is plain strings.
 * Supports quoted fields, doubled quotes, embedded newlines, CRLF/LF/CR, and comma/semicolon/tab delimiters.
 */
export const CSV_LIMITS = {
  maxBytes: 2 * 1024 * 1024,
  maxRows: 5000,
  maxColumns: 60,
  maxCellLength: 500,
} as const;

export type Delimiter = "," | ";" | "\t";

export interface ParsedCsv {
  headers: string[];
  /** Each row has exactly headers.length cells. */
  rows: string[][];
  /** 1-based line numbers in the source file, aligned with rows (header is line 1). */
  lineNumbers: number[];
  delimiter: Delimiter;
  /** Problems that do not stop parsing (skipped rows, etc.). */
  warnings: string[];
}

export type CsvResult = { ok: true; data: ParsedCsv } | { ok: false; error: string };

export function detectDelimiter(text: string): Delimiter {
  // Count candidates on the first non-empty line, outside quotes.
  let inQuotes = false;
  const counts: Record<Delimiter, number> = { ",": 0, ";": 0, "\t": 0 };
  for (const ch of text) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes) {
      if (ch === "\n" || ch === "\r") {
        if (counts[","] + counts[";"] + counts["\t"] > 0) break;
      } else if (ch === "," || ch === ";" || ch === "\t") counts[ch] += 1;
    }
  }
  if (counts["\t"] > counts[","] && counts["\t"] >= counts[";"]) return "\t";
  if (counts[";"] > counts[","]) return ";";
  return ",";
}

export function parseCsv(input: string, limits: typeof CSV_LIMITS = CSV_LIMITS): CsvResult {
  if (input.length > limits.maxBytes) {
    return { ok: false, error: `The file is larger than ${Math.round(limits.maxBytes / 1024 / 1024)} MB.` };
  }
  let text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  if (text.includes("\u0000")) {
    return { ok: false, error: "This does not look like a text CSV file (it contains binary data)." };
  }
  if (text.trim() === "") return { ok: false, error: "The file is empty." };

  const delimiter = detectDelimiter(text);
  const records: { cells: string[]; line: number }[] = [];
  let cells: string[] = [];
  let field = "";
  let inQuotes = false;
  let fieldStartedQuoted = false;
  let line = 1;
  let recordLine = 1;
  let tooLong = false;

  const endField = () => {
    if (field.length > limits.maxCellLength) tooLong = true;
    cells.push(fieldStartedQuoted ? field : field.trim());
    field = "";
    fieldStartedQuoted = false;
  };
  const endRecord = () => {
    endField();
    if (!(cells.length === 1 && cells[0] === "")) records.push({ cells, line: recordLine });
    cells = [];
  };

  text = text.replace(/\r\n?/g, "\n"); // normalise newlines
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        if (ch === "\n") line++;
        field += ch;
      }
    } else if (ch === '"' && field.trim() === "") {
      inQuotes = true;
      fieldStartedQuoted = true;
      field = "";
    } else if (ch === delimiter) {
      endField();
    } else if (ch === "\n") {
      endRecord();
      line++;
      recordLine = line;
      if (records.length > limits.maxRows + 1) break;
    } else {
      field += ch;
    }
    if (tooLong) return { ok: false, error: `A cell is longer than ${limits.maxCellLength} characters (near line ${recordLine}). Check for a missing closing quote.` };
  }
  if (inQuotes) return { ok: false, error: "A quoted value is never closed (missing closing quote)." };
  if (field !== "" || cells.length > 0) endRecord();
  if (tooLong) return { ok: false, error: `A cell is longer than ${limits.maxCellLength} characters. Check for a missing closing quote.` };

  const head = records.shift();
  if (!head) return { ok: false, error: "No header row found." };
  if (head.cells.length > limits.maxColumns) {
    return { ok: false, error: `Too many columns (${head.cells.length}). The limit is ${limits.maxColumns}.` };
  }
  if (records.length === 0) return { ok: false, error: "The file has a header row but no data rows." };
  if (records.length > limits.maxRows) {
    return { ok: false, error: `Too many rows (more than ${limits.maxRows.toLocaleString("en-IN")}). Split the file or remove rows you do not need.` };
  }

  const seen = new Map<string, number>();
  const headers = head.cells.map((h, i) => {
    let name = h.trim() || `Column ${i + 1}`;
    const n = (seen.get(name.toLowerCase()) ?? 0) + 1;
    seen.set(name.toLowerCase(), n);
    if (n > 1) name = `${name} (${n})`;
    return name;
  });

  const warnings: string[] = [];
  const rows: string[][] = [];
  const lineNumbers: number[] = [];
  let skippedWide = 0;
  for (const r of records) {
    if (r.cells.length > headers.length) {
      skippedWide += 1;
      if (skippedWide <= 3) warnings.push(`Line ${r.line} has ${r.cells.length} values but the header has ${headers.length}; the row was skipped. A value containing a comma needs to be in "quotes".`);
      continue;
    }
    const padded = r.cells.slice();
    while (padded.length < headers.length) padded.push("");
    rows.push(padded);
    lineNumbers.push(r.line);
  }
  if (skippedWide > 3) warnings.push(`${skippedWide - 3} more row(s) with too many values were also skipped.`);
  if (rows.length === 0) return { ok: false, error: "No usable data rows were found." };
  return { ok: true, data: { headers, rows, lineNumbers, delimiter, warnings } };
}
