import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { fail, ok, type ActionResult } from "@/types/action";
import type { Actor } from "@/lib/org/mutations";
import { logAuditStrict } from "@/lib/audit";
import { toCsv } from "@/lib/csv";
import { formatDateTime } from "@/lib/format";
import { CALL_STATUS_LABEL, STAGE_LABEL, TEMPERATURE_LABEL } from "@/lib/leads/labels";
import { filteredLeads } from "@/lib/leads/queries";
import { leadFiltersSchema, type LeadFilters } from "@/lib/schemas/lead";

// CSV export (task A3.2). This is THE control that protects the lead database (D-013): viewing
// cannot be locked down because callers must see numbers to dial them, so what stops the database
// walking out is that only admin and super_admin can export, and that EVERY export leaves an
// audit row with the row count and the filter.
//
// Two rules make that real, both enforced here rather than in the UI:
//   1. the audit row is written BEFORE any data is returned, and if it cannot be written the export
//      is refused (logAuditStrict) — an unaudited export must be impossible, not merely unlikely;
//   2. the role is checked before any query runs.

type Client = SupabaseClient<Database>;

const ONLY_ADMIN = "Only admins can export leads.";
const PAGE = 1000; // PostgREST's default row cap per request
/** A technical safeguard against one request holding the whole database in memory. Narrow the filters to go beyond it. */
export const EXPORT_MAX_ROWS = 20_000;

const isAdmin = (a: Actor) => a.role === "super_admin" || a.role === "admin";

// Inner join on persons only when searching (see listSelect in queries.ts for why).
const exportSelect = (searching: boolean) =>
  [
    "id, call_status, temperature, pipeline_stage, budget_min, budget_max, created_at, last_activity_at, next_call_at",
    searching ? "persons!inner(full_name, phone, email)" : "persons(full_name, phone, email)",
    "projects(name)",
    "owner:users!leads_assigned_to_fkey(full_name)",
    // aliased so it cannot collide with the source-filter join that filteredLeads adds
    "srcs:lead_sources(campaign, sources(name))",
  ].join(", ");

type RawExportRow = {
  id: string;
  call_status: keyof typeof CALL_STATUS_LABEL;
  temperature: keyof typeof TEMPERATURE_LABEL | null;
  pipeline_stage: keyof typeof STAGE_LABEL;
  budget_min: number | null;
  budget_max: number | null;
  created_at: string;
  last_activity_at: string | null;
  next_call_at: string | null;
  persons: { full_name: string | null; phone: string; email: string | null } | null;
  projects: { name: string } | null;
  owner: { full_name: string } | null;
  srcs: { campaign: string | null; sources: { name: string } | null }[];
};

export const EXPORT_HEADER = [
  "Name",
  "Phone",
  "Email",
  "Project",
  "Sources",
  "Campaigns",
  "Call status",
  "Temperature",
  "Stage",
  "Owner",
  "Budget min",
  "Budget max",
  "Received",
  "Last activity",
  "Next call",
] as const;

const uniq = (xs: (string | null | undefined)[]) => [...new Set(xs.filter((x): x is string => !!x))];

function toRow(r: RawExportRow): unknown[] {
  return [
    r.persons?.full_name ?? "",
    r.persons?.phone ?? "",
    r.persons?.email ?? "",
    r.projects?.name ?? "",
    uniq(r.srcs.map((s) => s.sources?.name)).join("; "),
    uniq(r.srcs.map((s) => s.campaign)).join("; "),
    CALL_STATUS_LABEL[r.call_status] ?? r.call_status,
    r.temperature ? TEMPERATURE_LABEL[r.temperature] : "",
    STAGE_LABEL[r.pipeline_stage] ?? r.pipeline_stage,
    r.owner?.full_name ?? "",
    r.budget_min ?? "",
    r.budget_max ?? "",
    formatDateTime(r.created_at),
    formatDateTime(r.last_activity_at),
    formatDateTime(r.next_call_at),
  ];
}

/** Builds the CSV for the given filters. Read-only; the audit row is the caller's job (see below). */
export async function buildLeadsCsv(supabase: Client, actor: Actor, rawFilters: unknown): Promise<ActionResult<{ csv: string; rowCount: number; filters: LeadFilters }>> {
  if (!isAdmin(actor)) return fail(ONLY_ADMIN);
  const parsed = leadFiltersSchema.safeParse(rawFilters ?? {});
  if (!parsed.success) return fail("Those filters are not valid. Reset them and try again.");
  const filters = parsed.data;

  const byId = new Map<string, RawExportRow>();
  let expected = 0;
  for (let from = 0; ; from += PAGE) {
    const { query } = await filteredLeads(supabase, actor.id, filters, exportSelect(!!filters.search), from === 0);
    const { data, error, count } = await query
      .order("created_at", { ascending: false })
      .order("id") // stable paging
      .range(from, from + PAGE - 1);
    if (error) {
      console.error("[export] page failed:", error.code, error.message);
      return fail("Could not read the leads for the export. Nothing was exported. Try again.");
    }
    if (from === 0) {
      expected = count ?? 0;
      if (expected > EXPORT_MAX_ROWS) {
        return fail(`That is ${expected.toLocaleString()} leads; one export is limited to ${EXPORT_MAX_ROWS.toLocaleString()}. Narrow the filters (for example by project or date) and export in parts.`);
      }
    }
    const rows = data as unknown as RawExportRow[];
    for (const r of rows) byId.set(r.id, r);
    if (rows.length < PAGE) break;
  }

  // Leads added or removed while the pages were being read would silently skip or repeat rows.
  // Refuse rather than hand over a file that does not match its own audit row.
  if (byId.size !== expected) {
    return fail("The leads changed while the export was running. Nothing was exported. Try again.");
  }

  const ordered = [...byId.values()].sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : a.id.localeCompare(b.id)));
  const csv = toCsv([[...EXPORT_HEADER], ...ordered.map(toRow)]);
  return ok({ csv, rowCount: ordered.length, filters });
}

/** IST calendar date, for the filename. */
const istDate = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());

/**
 * The export the app exposes: builds the CSV, records it in the audit log, and only then returns it.
 * If the audit row cannot be written, NOTHING is returned.
 */
export async function exportLeadsWithAudit(
  supabase: Client,
  actor: Actor,
  rawFilters: unknown,
): Promise<ActionResult<{ csv: string; rowCount: number; filename: string }>> {
  const built = await buildLeadsCsv(supabase, actor, rawFilters);
  if (!built.ok) return built;

  const logged = await logAuditStrict(supabase, actor.id, "export", "leads", null, {
    rowCount: built.data.rowCount,
    filters: built.data.filters,
  });
  if (!logged) {
    return fail("The export was blocked because it could not be recorded in the audit log. Nothing was downloaded. Try again.");
  }
  return ok({ csv: built.data.csv, rowCount: built.data.rowCount, filename: `parmar-leads-${istDate()}.csv` });
}
