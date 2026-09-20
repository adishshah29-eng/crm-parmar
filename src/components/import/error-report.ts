import { getImportErrors } from "@/actions/import";
import { CSV_BOM, toCsv } from "@/lib/csv";

/** Saves text as a UTF-8 CSV download (with the BOM Excel needs for Indian names). */
export function downloadCsv(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([CSV_BOM + text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * The rows an import rejected, each with the reason and every column of the original row, so the
 * file can be corrected in a spreadsheet and imported again. Returns an error message, or null.
 */
export async function downloadImportErrors(importId: string, filename: string): Promise<string | null> {
  const res = await getImportErrors(importId);
  if (!res.ok) return res.error;
  const columns = [...new Set(res.data.flatMap((r) => Object.keys(r.raw ?? {})))];
  const rows = [["Row", "Problem", ...columns], ...res.data.map((r) => [r.row, r.reason, ...columns.map((h) => r.raw?.[h] ?? "")])];
  downloadCsv(`import-errors-${filename.replace(/\.csv$/i, "")}.csv`, toCsv(rows));
  return null;
}
