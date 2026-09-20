import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { fail, ok, type ActionResult } from "@/types/action";
import type { Actor } from "@/lib/org/mutations";
import { toPayloadRow } from "@/lib/import/parse";
import {
  importBatchSchema,
  startImportSchema,
  type ImportErrorRow,
  type ImportSummary,
} from "@/lib/import/schemas";
import { callRpc } from "@/lib/supabase/rpc";

// CSV import, server side (task A3.1). Pure functions over a session-bound client, no next/* imports,
// so supabase/tests can drive them directly.
//
// Flow: startImport creates the `imports` row; the browser then sends the file in batches; each
// batch is ONE call to public.import_leads_batch (migration 0008), which applies the ingestion rules
// of brain/05-lead-flow.md inside the database. The `imports` row accumulates the counts and the
// error report, so the summary is durable and the error rows can be downloaded later.
//
// Admin and super_admin only. The database function re-checks (app.is_admin()); the actor check
// here only gives a better message.

type Client = SupabaseClient<Database>;

const ONLY_ADMIN = "Only admins can import leads.";
const MIGRATION_MISSING = "Importing needs migration 0008, which has not been applied to this database. Ask Adish to run db push.";

const isAdmin = (a: Actor) => a.role === "super_admin" || a.role === "admin";

export async function startImportCore(supabase: Client, actor: Actor, rawInput: unknown): Promise<ActionResult<{ importId: string }>> {
  if (!isAdmin(actor)) return fail(ONLY_ADMIN);
  const parsed = startImportSchema.safeParse(rawInput);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the file and try again.");

  const { data: source } = await supabase.from("sources").select("code").eq("code", parsed.data.sourceCode).maybeSingle();
  if (!source) return fail("That source does not exist.");

  const { data, error } = await supabase
    .from("imports")
    .insert({ uploaded_by: actor.id, filename: parsed.data.filename, total_rows: parsed.data.totalRows })
    .select("id")
    .single();
  if (error) {
    console.error("[import] start failed:", error.code, error.message);
    return fail(error.code === "42501" ? ONLY_ADMIN : "Could not start the import. Try again.");
  }
  return ok({ importId: data.id });
}

export type BatchResult = { inserted: number; duplicates: number; errors: ImportErrorRow[] };

export async function importBatchCore(supabase: Client, actor: Actor, rawInput: unknown): Promise<ActionResult<BatchResult>> {
  if (!isAdmin(actor)) return fail(ONLY_ADMIN);
  const parsed = importBatchSchema.safeParse(rawInput);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "This batch is not valid.");
  const { importId, sourceCode, campaign, rows } = parsed.data;

  // The browser may have previewed the rows, but only the server's cleaning counts.
  const payload = rows.map(toPayloadRow);

  const { data, error } = await callRpc<{ inserted: number; duplicates: number; errors: ImportErrorRow[] }>(
    supabase,
    "import_leads_batch",
    { p_import: importId, p_source: sourceCode, p_campaign: campaign ?? null, p_rows: payload },
  );
  if (error) {
    console.error("[import] batch failed:", error.code, error.message);
    if (error.code === "PGRST202") return fail(MIGRATION_MISSING);
    if (error.code === "42501") return fail(ONLY_ADMIN);
    if (error.code === "22023") return fail("This import or source no longer exists. Start again.");
    // Nothing in this batch was saved (one transaction). Re-running the file is safe: repeats count as duplicates.
    return fail("This batch could not be saved. Nothing in it was imported; run the file again to continue.");
  }
  return ok({ inserted: data?.inserted ?? 0, duplicates: data?.duplicates ?? 0, errors: data?.errors ?? [] });
}

export async function queryImportSummary(supabase: Client, importId: string): Promise<ActionResult<ImportSummary>> {
  const { data, error } = await supabase
    .from("imports")
    .select("id, filename, total_rows, inserted, duplicates, errors, created_at, uploader:uploaded_by(full_name)")
    .eq("id", importId)
    .maybeSingle();
  if (error || !data) return fail("That import was not found.");
  return ok(mapSummary(data as unknown as RawImport));
}

export async function queryImports(supabase: Client, limit = 30): Promise<ActionResult<ImportSummary[]>> {
  const { data, error } = await supabase
    .from("imports")
    .select("id, filename, total_rows, inserted, duplicates, errors, created_at, uploader:uploaded_by(full_name)")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("[import] history failed:", error.code, error.message);
    return fail("Could not load the import history. Try again in a moment.");
  }
  return ok((data as unknown as RawImport[]).map(mapSummary));
}

/** The stored error rows, with each original CSV row, so the file can be corrected and re-imported. */
export async function queryImportErrors(supabase: Client, importId: string): Promise<ActionResult<ImportErrorRow[]>> {
  const { data, error } = await supabase.from("imports").select("error_report").eq("id", importId).maybeSingle();
  if (error || !data) return fail("That import was not found.");
  const rows = Array.isArray(data.error_report) ? (data.error_report as unknown as ImportErrorRow[]) : [];
  return ok([...rows].sort((a, b) => a.row - b.row));
}

type RawImport = {
  id: string;
  filename: string;
  total_rows: number;
  inserted: number;
  duplicates: number;
  errors: number;
  created_at: string;
  uploader: { full_name: string } | null;
};

const mapSummary = (r: RawImport): ImportSummary => ({
  importId: r.id,
  filename: r.filename,
  totalRows: r.total_rows,
  inserted: r.inserted,
  duplicates: r.duplicates,
  errors: r.errors,
  createdAt: r.created_at,
  uploadedBy: r.uploader?.full_name ?? null,
});
