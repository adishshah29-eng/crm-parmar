import { parsePhoneNumberFromString } from "libphonenumber-js";

const TZ = "Asia/Kolkata";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Store E.164, display `+91 98765 43210`. Falls back to the raw string. */
export function formatPhone(e164: string | null | undefined): string {
  if (!e164) return "";
  const p = parsePhoneNumberFromString(e164);
  return p ? p.formatInternational() : e164;
}

/** Normalise user input to E.164 (+91 default). Returns null if not a valid number. */
export function normalisePhone(raw: string): string | null {
  const p = parsePhoneNumberFromString(raw.trim(), "IN");
  return p && p.isValid() ? p.number : null;
}

/** `tel:` href for tap-to-dial. */
export const telHref = (e164: string) => `tel:${e164}`;

function istParts(d: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    day: "numeric",
    month: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return {
    day: get("day"),
    month: MONTHS[Number(get("month")) - 1],
    year: get("year"),
    hour: get("hour"),
    minute: get("minute"),
    period: get("dayPeriod").toLowerCase(),
  };
}

/** `19 Sep 2026, 3:45 pm` in Asia/Kolkata. */
export function formatDateTime(input: string | Date | null | undefined): string {
  if (!input) return "";
  const p = istParts(new Date(input));
  return `${p.day} ${p.month} ${p.year}, ${p.hour}:${p.minute} ${p.period}`;
}

/** `19 Sep 2026` in Asia/Kolkata. */
export function formatDate(input: string | Date | null | undefined): string {
  if (!input) return "";
  const p = istParts(new Date(input));
  return `${p.day} ${p.month} ${p.year}`;
}

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

/** Relative under 24h (`2 hours ago`), absolute after that. */
export function formatWhen(input: string | Date | null | undefined, now = new Date()): string {
  if (!input) return "";
  const d = new Date(input);
  const diffMin = Math.round((d.getTime() - now.getTime()) / 60000);
  const abs = Math.abs(diffMin);
  if (abs < 1) return "just now";
  if (abs < 60) return rtf.format(diffMin, "minute");
  if (abs < 60 * 24) return rtf.format(Math.round(diffMin / 60), "hour");
  return formatDateTime(d);
}

/** Rupees in lakhs / crores: 1.25 Cr, 85 L. */
export function formatRupees(n: number | null | undefined): string {
  if (n == null) return "";
  if (n >= 1e7) return `₹${+(n / 1e7).toFixed(2)} Cr`;
  if (n >= 1e5) return `₹${+(n / 1e5).toFixed(2)} L`;
  return `₹${n.toLocaleString("en-IN")}`;
}
