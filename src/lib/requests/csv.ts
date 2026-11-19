// CSV for the meeting request export (M5, PLAN v0.3 F7: the request list doubles as a contact list and must stay
// exportable after the Summit). Pure.
//
// RFC 4180 quoting, CRLF line ends and a UTF-8 byte order mark so Excel opens accents correctly. Guards against CSV
// formula injection (OWASP): a cell that a spreadsheet would treat as a formula (starting with = + - @, a tab or a
// carriage return, also after leading spaces) gets a leading apostrophe, so it is shown as text and never run.

const FORMULA_START = /^[\s]*[=+\-@\t\r]/;
const NEEDS_QUOTES = /[",\r\n]/;

export type CsvValue = string | number | Date | null | undefined;

/** One cell, neutralised and quoted as needed. Dates are written as ISO 8601 (UTC). */
export function csvCell(value: CsvValue): string {
  if (value === null || value === undefined) return "";
  let text =
    value instanceof Date
      ? value.toISOString()
      : typeof value === "number"
        ? String(value)
        : value;
  if (typeof value === "string" && FORMULA_START.test(text)) {
    text = `'${text}`;
  }
  return NEEDS_QUOTES.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export const CSV_BOM = "﻿";

/** A whole CSV document: header row plus data rows, CRLF line ends, with a byte order mark. */
export function toCsv(header: readonly string[], rows: CsvValue[][]): string {
  const lines = [header, ...rows].map((row) => row.map(csvCell).join(","));
  return `${CSV_BOM}${lines.join("\r\n")}\r\n`;
}
