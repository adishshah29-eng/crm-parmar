import { normalisePhone } from "@/lib/format";
import type { ColumnMapping, ImportField, ImportRowInput } from "@/lib/import/schemas";

// Pure CSV-cleaning helpers. They run in the browser (preview) and on the server (the authority).

// ---------------------------------------------------------------- phone

/**
 * Turns one CSV phone cell into E.164 (+91 default), or null.
 * Handles the ways real exports mangle numbers: spaces, dashes, a leading 0, and Excel's
 * scientific notation (9.87654E+09) which appears when a phone column was ever opened in Excel.
 */
export function cleanPhone(raw: string): string | null {
  let s = (raw ?? "").trim();
  if (!s) return null;
  if (/^\d(\.\d+)?e\+\d+$/i.test(s)) {
    const n = Number(s);
    if (!Number.isFinite(n)) return null;
    s = BigInt(Math.round(n)).toString();
  }
  // Some exports wrap the number in quotes or a leading apostrophe (Excel's text marker).
  s = s.replace(/^['"]+|['"]+$/g, "");
  return normalisePhone(s);
}

// ---------------------------------------------------------------- dates

export type ParsedDate = { ok: true; iso: string } | { ok: false };

const IST = "+05:30";
const pad = (n: string | number) => String(n).padStart(2, "0");

/**
 * Received-at. Accepts ISO 8601 (with or without an offset) and the Indian day-first forms
 * 19/09/2026, 19-09-2026, optionally followed by a time. A time with no offset is IST.
 * Anything else is rejected rather than guessed: 03/04/2026 is 3 April here, never 4 March.
 */
export function parseReceivedAt(raw: string): ParsedDate {
  const s = (raw ?? "").trim();
  if (!s) return { ok: false };

  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?(Z|[+-]\d{2}:?\d{2})?)?$/i);
  if (m) {
    const [, y, mo, d, h = "0", mi = "0", sec = "0", tz] = m;
    const zone = !tz ? IST : tz.toUpperCase() === "Z" ? "Z" : tz.includes(":") ? tz : `${tz.slice(0, 3)}:${tz.slice(3)}`;
    return finish(+y, +mo, +d, +h, +mi, +sec, zone);
  }

  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m) {
    const [, d, mo, y, h = "0", mi = "0", sec = "0"] = m;
    return finish(+y, +mo, +d, +h, +mi, +sec, IST);
  }
  return { ok: false };
}

/** Rejects impossible dates (31 Feb, 25:00) instead of letting Date roll them into the next month. */
function finish(y: number, mo: number, d: number, h: number, mi: number, sec: number, zone: string): ParsedDate {
  const cal = new Date(Date.UTC(y, mo - 1, d));
  if (cal.getUTCFullYear() !== y || cal.getUTCMonth() !== mo - 1 || cal.getUTCDate() !== d) return { ok: false };
  if (h > 23 || mi > 59 || sec > 59) return { ok: false };
  const t = new Date(`${String(y).padStart(4, "0")}-${pad(mo)}-${pad(d)}T${pad(h)}:${pad(mi)}:${pad(sec)}${zone}`);
  return Number.isNaN(t.getTime()) ? { ok: false } : { ok: true, iso: t.toISOString() };
}

// ---------------------------------------------------------------- column guessing

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

const SYNONYMS: Record<ImportField, string[]> = {
  phone: ["phone", "phonenumber", "mobile", "mobileno", "mobilenumber", "contact", "contactno", "contactnumber", "cell", "whatsapp", "telephone", "tel"],
  name: ["name", "fullname", "customername", "leadname", "clientname", "buyername", "firstname"],
  email: ["email", "emailid", "emailaddress", "mail"],
  project: ["project", "projectname", "property", "propertyname", "interestedproject", "interestedin", "development"],
  receivedAt: ["date", "createdat", "createdon", "createddate", "createdtime", "receivedat", "receivedon", "leaddate", "leadcreatedon", "timestamp", "submittedat", "enquirydate"],
  campaign: ["campaign", "campaignname", "adname", "adsetname", "formname", "leadsource", "utmcampaign"],
};

/** Best-guess mapping from the file's headers. The user always confirms it. */
export function guessMapping(headers: string[]): ColumnMapping {
  const columns = Object.fromEntries((Object.keys(SYNONYMS) as ImportField[]).map((f) => [f, ""])) as Record<ImportField, string>;
  const used = new Set<string>();
  for (const field of Object.keys(SYNONYMS) as ImportField[]) {
    // exact synonym first, then a header that merely contains one (e.g. "Lead Phone Number")
    const exact = headers.find((h) => !used.has(h) && SYNONYMS[field].includes(squash(h)));
    const loose = headers.find((h) => !used.has(h) && SYNONYMS[field].some((syn) => syn.length >= 5 && squash(h).includes(syn)));
    const hit = exact ?? loose;
    if (hit) {
      columns[field] = hit;
      used.add(hit);
    }
  }
  return { columns, projectMode: columns.project ? "column" : "fixed", fixedProject: "" };
}

// ---------------------------------------------------------------- rows

const cell = (row: Record<string, string>, header: string) => (header ? (row[header] ?? "").trim() : "");

/** One parsed CSV row -> what the server action receives. No cleaning here beyond trimming. */
export function toImportRow(rowNumber: number, row: Record<string, string>, mapping: ColumnMapping): ImportRowInput {
  return {
    row: rowNumber,
    phone: cell(row, mapping.columns.phone),
    name: cell(row, mapping.columns.name) || undefined,
    email: cell(row, mapping.columns.email) || undefined,
    project: mapping.projectMode === "fixed" ? mapping.fixedProject.trim() : cell(row, mapping.columns.project),
    receivedAt: cell(row, mapping.columns.receivedAt) || undefined,
    campaign: cell(row, mapping.columns.campaign) || undefined,
    raw: row,
  };
}

/** What the database function receives for one row. `error` set = recorded as an error row, not imported. */
export type PayloadRow = {
  row: number;
  phone: string | null;
  name: string | null;
  email: string | null;
  project: string;
  received_at: string | null;
  campaign: string | null;
  raw: Record<string, string>;
  error?: string;
};

/** Server-side cleaning and validation. The browser preview is a courtesy; this is the authority. */
export function toPayloadRow(input: ImportRowInput): PayloadRow {
  const base = {
    row: input.row,
    name: input.name?.trim() || null,
    email: input.email?.trim() || null,
    project: input.project.trim(),
    campaign: input.campaign?.trim() || null,
    raw: input.raw,
  };

  const phone = cleanPhone(input.phone);
  if (!phone) return { ...base, phone: null, received_at: null, error: input.phone.trim() ? `Not a valid phone number: "${input.phone.trim()}"` : "No phone number" };

  if (!base.project) return { ...base, phone, received_at: null, error: "No project given" };

  let receivedAt: string | null = null;
  if (input.receivedAt?.trim()) {
    const d = parseReceivedAt(input.receivedAt);
    if (!d.ok) return { ...base, phone, received_at: null, error: `Date not understood: "${input.receivedAt.trim()}" (use 2026-09-19 or 19/09/2026)` };
    receivedAt = d.iso;
  }
  return { ...base, phone, received_at: receivedAt };
}
