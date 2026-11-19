// CSV reader for the admin imports (M7, PLAN v0.3 F7). Pure and browser-safe.
//
// RFC 4180: fields separated by commas (or semicolons, as Excel saves CSV in many European locales), optional
// double quotes with "" for a quote inside, line breaks inside quoted fields, CRLF or LF line ends, a UTF-8 byte
// order mark at the start. Blank lines are skipped. The leading apostrophe that our own exports put in front of a
// cell starting with = + - @ (formula-injection guard, src/lib/requests/csv.ts) is removed again, so an export
// can be edited and imported back unchanged.

export interface CsvRow {
  /** Line number in the file where the row starts (1 = header), for error messages. */
  line: number;
  cells: string[];
}

export interface CsvTable {
  /** Normalised header names: lower case, trimmed, spaces and hyphens as underscores. */
  header: string[];
  rows: CsvRow[];
}

export type CsvParseResult =
  { ok: true; table: CsvTable } | { ok: false; error: string };

export interface CsvParseOptions {
  /** Data rows allowed (header not counted). */
  maxRows: number;
  /** Characters allowed in the whole text. */
  maxChars?: number;
}

const GUARDED = /^'(?=[\s]*[=+\-@\t\r])/;

/** "Size min (USD million)" -> "size_min_usd_million". */
export function normaliseHeader(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[()]/g, " ")
    .replace(/[\s\-/]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function detectDelimiter(text: string): "," | ";" {
  let inQuotes = false;
  let commas = 0;
  let semicolons = 0;
  for (const ch of text) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && (ch === "\n" || ch === "\r")) break;
    else if (!inQuotes && ch === ",") commas += 1;
    else if (!inQuotes && ch === ";") semicolons += 1;
  }
  return semicolons > commas ? ";" : ",";
}

function unguard(cell: string): string {
  return cell.replace(GUARDED, "");
}

/** Parses CSV text into a header and data rows. Never throws. */
export function parseCsv(
  input: string,
  { maxRows, maxChars = 1_000_000 }: CsvParseOptions,
): CsvParseResult {
  if (input.length > maxChars) {
    return {
      ok: false,
      error: "The file is too large. Split it into smaller files.",
    };
  }
  const text = input.replace(/^﻿/, "");
  if (text.trim() === "") return { ok: false, error: "The file is empty." };
  const delimiter = detectDelimiter(text);

  const records: CsvRow[] = [];
  let cells: string[] = [];
  let cell = "";
  let inQuotes = false;
  let quotedCell = false;
  let line = 1;
  let rowStart = 1;

  const endCell = () => {
    cells.push(quotedCell ? cell : cell.trim());
    cell = "";
    quotedCell = false;
  };
  const endRow = () => {
    endCell();
    if (cells.some((c) => c !== "")) {
      records.push({ line: rowStart, cells: cells.map(unguard) });
    }
    cells = [];
  };

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        if (ch === "\n") line += 1;
        cell += ch;
      }
      continue;
    }
    if (ch === '"' && cell.trim() === "") {
      inQuotes = true;
      quotedCell = true;
      cell = "";
    } else if (ch === delimiter) {
      endCell();
    } else if (ch === "\r" || ch === "\n") {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      endRow();
      line += 1;
      rowStart = line;
    } else if (!quotedCell) {
      cell += ch;
    }
    if (records.length > maxRows + 1) {
      return {
        ok: false,
        error: `The file has more than ${maxRows.toLocaleString("en-GB")} rows. Split it into smaller files.`,
      };
    }
  }
  if (inQuotes) {
    return {
      ok: false,
      error: `A quoted cell starting on line ${rowStart} is never closed.`,
    };
  }
  endRow();

  const [head, ...rows] = records;
  if (!head) return { ok: false, error: "The file is empty." };
  if (rows.length > maxRows) {
    return {
      ok: false,
      error: `The file has more than ${maxRows.toLocaleString("en-GB")} rows. Split it into smaller files.`,
    };
  }
  return {
    ok: true,
    table: { header: head.cells.map(normaliseHeader), rows },
  };
}

/** The value of a named column in a row ("" when the column or the cell is missing). */
export function cellOf(table: CsvTable, row: CsvRow, column: string): string {
  const index = table.header.indexOf(column);
  return index === -1 ? "" : (row.cells[index] ?? "").trim();
}

/** The first of several accepted names that the header has, or null. */
export function findColumn(
  table: CsvTable,
  names: readonly string[],
): string | null {
  return names.find((name) => table.header.includes(name)) ?? null;
}
