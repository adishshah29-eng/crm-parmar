import type { ColumnMapping } from "@/lib/import/schemas";

// "Column mapping remembered per source" (task A3.1). Kept in this browser's localStorage, because
// the data model has no table for it and the brain forbids inventing schema. The trade-off: each
// person re-maps once per browser. Everything here tolerates storage being blocked or empty.

const key = (source: string) => `parmar.import.mapping.v1.${source}`;

export function loadMapping(source: string, headers: string[]): ColumnMapping | null {
  try {
    const raw = window.localStorage.getItem(key(source));
    if (!raw) return null;
    const m = JSON.parse(raw) as ColumnMapping;
    if (!m?.columns || (m.projectMode !== "column" && m.projectMode !== "fixed")) return null;
    // A remembered header that this file does not have would silently read blanks: drop it.
    const columns = Object.fromEntries(
      Object.entries(m.columns).map(([field, header]) => [field, header && headers.includes(header) ? header : ""]),
    ) as ColumnMapping["columns"];
    if (!columns.phone) return null; // not a usable memory for this file: fall back to guessing
    return { columns, projectMode: m.projectMode, fixedProject: m.fixedProject ?? "" };
  } catch {
    return null;
  }
}

export function saveMapping(source: string, mapping: ColumnMapping): void {
  try {
    window.localStorage.setItem(key(source), JSON.stringify(mapping));
  } catch {
    /* private window or blocked storage: the import still works, it just will not be remembered */
  }
}
