// CSV writing, shared by the lead export (server) and the import error report (browser).
//
// Every cell that could be read by a spreadsheet as a FORMULA is neutralised. Lead data comes from
// portals and ad forms we do not control, so a buyer can type =HYPERLINK(...) into a name field and
// it would run when an admin opens the export in Excel. A leading ' makes the cell plain text.

const FORMULA_START = /^[=+\-@\t\r]/;
const PLAIN_E164 = /^\+\d{8,15}$/; // a real phone number must keep its + (and is not a formula)

/** Neutralise formula injection. Plain phone numbers like +919876543210 are left alone. */
export function safeCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (FORMULA_START.test(s) && !PLAIN_E164.test(s)) return `'${s}`;
  return s;
}

/** RFC 4180 quoting. */
function quote(s: string): string {
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Rows of plain values -> CSV text (CRLF line endings, formula-safe). */
export function toCsv(rows: unknown[][]): string {
  return rows.map((r) => r.map((c) => quote(safeCell(c))).join(",")).join("\r\n") + "\r\n";
}

/** Excel opens UTF-8 CSV correctly only with a BOM; without it, Indian names are garbled. */
export const CSV_BOM = "﻿";
