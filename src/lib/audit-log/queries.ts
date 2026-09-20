import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/types/database";
import { fail, ok, type ActionResult } from "@/types/action";
import { AUDIT_ACTIONS } from "@/lib/audit";

// Read side of the audit log (task A3.3). Admin and super_admin only: audit_select is
// app.is_admin(), so anyone else simply gets zero rows. Pure functions, no next/* imports.

type Client = SupabaseClient<Database>;

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

export const auditParamsSchema = z.object({
  actor: z.guid().optional(),
  action: z.enum(AUDIT_ACTIONS as unknown as [string, ...string[]]).optional(),
  from: day.optional(),
  to: day.optional(),
  page: z.number().int().min(1).max(10_000).optional(),
  pageSize: z.number().int().min(1).max(200).optional(),
});
export type AuditParams = z.infer<typeof auditParamsSchema>;

export type AuditRow = {
  id: string;
  at: string;
  actorId: string | null;
  actorName: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  meta: Record<string, unknown> | null;
};

type RawAudit = {
  id: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  meta: Record<string, unknown> | null;
  created_at: string;
  actor_id: string | null;
  actor: { full_name: string } | null;
};

const SELECT = "id, action, entity_type, entity_id, meta, created_at, actor_id, actor:actor_id(full_name)";

const mapRow = (r: RawAudit): AuditRow => ({
  id: r.id,
  at: r.created_at,
  actorId: r.actor_id,
  actorName: r.actor?.full_name ?? null,
  action: r.action,
  entityType: r.entity_type,
  entityId: r.entity_id,
  meta: r.meta && typeof r.meta === "object" ? r.meta : null,
});

export async function queryAuditLog(supabase: Client, rawParams: unknown): Promise<ActionResult<{ rows: AuditRow[]; total: number }>> {
  const parsed = auditParamsSchema.safeParse(rawParams ?? {});
  if (!parsed.success) return fail("Those filters are not valid. Reset them and try again.");
  const p = parsed.data;
  const page = p.page ?? 1;
  const pageSize = p.pageSize ?? 50;

  let q = supabase.from("audit_log").select(SELECT, { count: "exact" });
  if (p.actor) q = q.eq("actor_id", p.actor);
  if (p.action) q = q.eq("action", p.action);
  // Days are IST days, like everywhere else in the product.
  if (p.from) q = q.gte("created_at", `${p.from}T00:00:00+05:30`);
  if (p.to) q = q.lte("created_at", `${p.to}T23:59:59.999+05:30`);

  const from = (page - 1) * pageSize;
  const { data, error, count } = await q
    .order("created_at", { ascending: false })
    .order("id")
    .range(from, from + pageSize - 1);
  if (error) {
    console.error("[audit] list failed:", error.code, error.message);
    return fail("Could not load the audit log. Try again in a moment.");
  }
  return ok({ rows: (data as unknown as RawAudit[]).map(mapRow), total: count ?? 0 });
}

/**
 * Exports, newest first. This is the view that answers "did someone take the database": who, when,
 * how many leads, and which filter. It is deliberately not affected by the page's other filters.
 */
export async function queryRecentExports(supabase: Client, limit = 25): Promise<ActionResult<{ rows: AuditRow[]; total: number }>> {
  const { data, error, count } = await supabase
    .from("audit_log")
    .select(SELECT, { count: "exact" })
    .eq("action", "export")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("[audit] exports failed:", error.code, error.message);
    return fail("Could not load the export history. Try again in a moment.");
  }
  return ok({ rows: (data as unknown as RawAudit[]).map(mapRow), total: count ?? 0 });
}

// ---------------------------------------------------------------- presentation helpers (pure)

const FILTER_LABEL: Record<string, string> = {
  search: "search",
  callStatus: "status",
  temperature: "temperature",
  stage: "stage",
  projectId: "project",
  assignedTo: "owner",
  sourceCode: "source",
  createdFrom: "from",
  createdTo: "to",
  slaBreached: "SLA breached",
  untouched: "untouched",
};

/** "status: connected · from: 2026-09-01", or "no filters" (a whole-database export). */
export function describeFilters(filters: unknown): string {
  if (!filters || typeof filters !== "object") return "no filters";
  const parts = Object.entries(filters as Record<string, unknown>)
    .filter(([, v]) => v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && v.length === 0))
    .map(([k, v]) => {
      const label = FILTER_LABEL[k] ?? k;
      if (v === true) return label;
      return `${label}: ${Array.isArray(v) ? v.join(", ") : String(v)}`;
    });
  return parts.length ? parts.join(" · ") : "no filters";
}

/** One line of context for a row, from its meta. */
export function summariseMeta(action: string, meta: Record<string, unknown> | null): string {
  if (!meta) return "";
  if (action === "export") {
    return `${Number(meta.rowCount ?? 0).toLocaleString()} leads · ${describeFilters(meta.filters)}`;
  }
  if (action === "import") {
    return `${meta.filename ?? "file"}: ${meta.inserted ?? 0} new, ${meta.duplicates ?? 0} duplicates, ${meta.errors ?? 0} errors`;
  }
  if (action === "reassign" && meta.bulk) {
    return `${meta.moved ?? 0} of ${meta.requested ?? 0} leads · ${meta.reason ?? "manual"}`;
  }
  const s = JSON.stringify(meta);
  return s.length > 140 ? `${s.slice(0, 137)}…` : s;
}

/** Where to look at the thing an audit row is about, when there is somewhere to look. */
export function entityHref(entityType: string | null, entityId: string | null): string | null {
  if (!entityType) return null;
  if (entityType === "lead" && entityId) return `/leads/${entityId}`;
  if (entityType === "user" && entityId) return `/users/${entityId}`;
  if (entityType === "import") return "/import";
  if (entityType === "project" || entityType === "location") return "/territories/projects";
  return null;
}
