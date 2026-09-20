"use server";

import { revalidatePath } from "next/cache";
import { createServerClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { importBatchCore, queryImportErrors, queryImportSummary, startImportCore, type BatchResult } from "@/lib/import/core";
import { fail, type ActionResult } from "@/types/action";
import type { ImportBatchInput, ImportErrorRow, ImportSummary, StartImportInput } from "@/lib/import/schemas";

// CSV import (Adish, A3.1). The contract in brain/06-api-contracts.md was one importLeads() call;
// a real file cannot go through one request (size limit, statement timeout) so it is three:
// startImport -> importBatch (repeated, ~100 rows each) -> the summary. See D-030.
// Admin and super_admin only.

const SIGN_IN_AGAIN = "Please sign in again.";

export async function startImport(input: StartImportInput): Promise<ActionResult<{ importId: string }>> {
  const user = await getCurrentUser();
  if (!user) return fail(SIGN_IN_AGAIN);
  const supabase = await createServerClient();
  return startImportCore(supabase, user, input);
}

export async function importBatch(input: ImportBatchInput): Promise<ActionResult<BatchResult>> {
  const user = await getCurrentUser();
  if (!user) return fail(SIGN_IN_AGAIN);
  const supabase = await createServerClient();
  return importBatchCore(supabase, user, input);
}

/** Called once, when the browser has sent every batch. Logs the import and returns the durable totals. */
export async function finishImport(importId: string): Promise<ActionResult<ImportSummary>> {
  const user = await getCurrentUser();
  if (!user) return fail(SIGN_IN_AGAIN);
  const supabase = await createServerClient();

  const summary = await queryImportSummary(supabase, importId);
  if (summary.ok) {
    await logAudit(supabase, user.id, "import", "import", importId, {
      filename: summary.data.filename,
      totalRows: summary.data.totalRows,
      inserted: summary.data.inserted,
      duplicates: summary.data.duplicates,
      errors: summary.data.errors,
    });
    revalidatePath("/import");
    revalidatePath("/leads", "layout");
  }
  return summary;
}

export async function getImportErrors(importId: string): Promise<ActionResult<ImportErrorRow[]>> {
  const user = await getCurrentUser();
  if (!user) return fail(SIGN_IN_AGAIN);
  const supabase = await createServerClient();
  return queryImportErrors(supabase, importId);
}
