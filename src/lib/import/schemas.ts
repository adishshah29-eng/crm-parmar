import { z } from "zod";

// Limits are technical safeguards, not business rules: they keep one import inside the API's
// request-size and statement-time limits. Split bigger files.
export const IMPORT_MAX_ROWS = 5000;
export const IMPORT_MAX_FILE_BYTES = 5 * 1024 * 1024;
/** Rows per database call from the browser. The database function accepts up to 500. */
export const IMPORT_BATCH_SIZE = 100;
export const IMPORT_SERVER_BATCH_MAX = 200;

const guid = z.guid();

export const startImportSchema = z.object({
  filename: z.string().trim().min(1, "Choose a file").max(200),
  totalRows: z.number().int().min(1, "The file has no data rows").max(IMPORT_MAX_ROWS, `At most ${IMPORT_MAX_ROWS} rows per import. Split the file.`),
  sourceCode: z.string().trim().min(1, "Pick the source").max(30),
});
export type StartImportInput = z.infer<typeof startImportSchema>;

/** One CSV row after the column mapping, exactly as read: the server does the cleaning. */
export const importRowSchema = z.object({
  row: z.number().int().min(1),
  phone: z.string().max(60),
  name: z.string().max(200).optional(),
  email: z.string().max(200).optional(),
  project: z.string().max(200),
  receivedAt: z.string().max(60).optional(),
  campaign: z.string().max(120).optional(),
  /** Every column of the original row, kept as the lead source's raw payload. */
  raw: z
    .record(z.string(), z.string())
    .refine((r) => JSON.stringify(r).length <= 8000, "This row is too large"),
});
export type ImportRowInput = z.infer<typeof importRowSchema>;

export const importBatchSchema = z.object({
  importId: guid,
  sourceCode: z.string().trim().min(1).max(30),
  campaign: z.string().trim().max(120).optional(),
  rows: z.array(importRowSchema).min(1).max(IMPORT_SERVER_BATCH_MAX),
});
export type ImportBatchInput = z.infer<typeof importBatchSchema>;

export type ImportErrorRow = { row: number; reason: string; raw: Record<string, string> | null };
export type ImportSummary = {
  importId: string;
  filename: string;
  totalRows: number;
  inserted: number;
  duplicates: number;
  errors: number;
  createdAt: string;
  uploadedBy: string | null;
};

/** The columns the import understands. `project` may instead be one fixed project for the whole file. */
export const IMPORT_FIELDS = ["phone", "name", "email", "project", "receivedAt", "campaign"] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];

export type ColumnMapping = {
  /** CSV header for each field, or "" when the file has no such column. */
  columns: Record<ImportField, string>;
  /** "column": read the project from a column. "fixed": every row is for `fixedProject`. */
  projectMode: "column" | "fixed";
  fixedProject: string;
};
