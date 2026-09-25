import type { SupabaseClient } from "@supabase/supabase-js";
import { addMonths } from "date-fns";
import type { Database } from "@/types/database";
import { fail, ok, type ActionResult } from "@/types/action";
import {
  NO_ACCESS,
  type LeadActivity,
  type LeadDetail,
  type LeadRow,
  type LeadSourceEntry,
} from "@/types/leads";
import {
  addRemarkSchema,
  callOutcomeSchema,
  leadListParamsSchema,
  type CallOutcomeInput,
  type LeadFilters,
  type LeadListParams,
} from "@/lib/schemas/lead";

// Pure data layer for leads. No next/* or react imports, so it runs identically in a
// server action and in supabase/tests. The caller passes a SESSION-BOUND client: every
// query below runs as that user and RLS decides which rows exist. There is deliberately
// no role branching in this file — one query, three correct answers.

type Client = SupabaseClient<Database>;

const DEFAULT_PAGE_SIZE = 25;
const NIL_UUID = "00000000-0000-0000-0000-000000000000";
const RLS_VIOLATION = "42501";

// ---------------------------------------------------------------- list

type RawRow = {
  id: string;
  project_id: string;
  call_status: LeadRow["callStatus"];
  temperature: LeadRow["temperature"];
  pipeline_stage: LeadRow["pipelineStage"];
  is_live: boolean;
  assigned_to: string | null;
  first_touch_at: string | null;
  last_activity_at: string | null;
  next_call_at: string | null;
  sla_due_at: string | null;
  sla_breached_at: string | null;
  created_at: string;
  persons: { full_name: string | null; phone: string } | null;
  projects: { name: string } | null;
  owner: { full_name: string } | null;
};

const mapRow = (r: RawRow): LeadRow => ({
  id: r.id,
  personName: r.persons?.full_name ?? null,
  phone: r.persons?.phone ?? "",
  projectId: r.project_id,
  projectName: r.projects?.name ?? "",
  callStatus: r.call_status,
  temperature: r.temperature,
  pipelineStage: r.pipeline_stage,
  ownerName: r.owner?.full_name ?? null,
  assignedTo: r.assigned_to,
  isLive: r.is_live,
  firstTouchAt: r.first_touch_at,
  lastActivityAt: r.last_activity_at,
  nextCallAt: r.next_call_at,
  slaDueAt: r.sla_due_at,
  slaBreachedAt: r.sla_breached_at,
  createdAt: r.created_at,
});

/** Everyone at or below `userId`, excluding themself. user_hierarchy is readable by all. */
async function teamIds(supabase: Client, userId: string): Promise<string[]> {
  const { data } = await supabase.from("user_hierarchy").select("descendant_id").eq("ancestor_id", userId);
  return (data ?? []).map((r) => r.descendant_id).filter((id) => id !== userId);
}

/** Strip characters that would break PostgREST's or() syntax or act as wildcards. */
const cleanName = (s: string) => s.replace(/[^\p{L}\p{N}\s.'-]/gu, "").trim();

// persons is an INNER join only when searching (the search filters on it). Otherwise it is a plain
// join: the exact count then never has to visit persons, and persons_select re-checks the lead for
// every joined row. Measured at 20k leads as a manager: inner 1.4-1.7 s, plain 75 ms, same count.
const listSelect = (searching: boolean) =>
  [
    "id, project_id, call_status, temperature, pipeline_stage, is_live, assigned_to",
    "first_touch_at, last_activity_at, next_call_at, sla_due_at, sla_breached_at, created_at",
    searching ? "persons!inner(full_name, phone)" : "persons(full_name, phone)",
    "projects(name)",
    "owner:users!leads_assigned_to_fkey(full_name)",
  ].join(", ");

/**
 * Applies every filter the user chose to the leads table. Shared by the list screen and the export,
 * so the two can never disagree about what "the current filters" means. The caller adds ordering
 * and paging. lead_sources is only joined when filtering by source, so it does not multiply the
 * payload otherwise. RLS still decides which rows exist at all.
 */
export async function filteredLeads(supabase: Client, userId: string, f: LeadFilters, baseSelect: string, withCount: boolean) {
  const bySource = !!f.sourceCode?.length;
  const select = [baseSelect, bySource ? "lead_sources!inner(sources!inner(code))" : null].filter(Boolean).join(", ");

  let q = supabase.from("leads").select(select, withCount ? { count: "exact" } : undefined);

  if (f.callStatus?.length) q = q.in("call_status", f.callStatus);
  if (f.temperature?.length) q = q.in("temperature", f.temperature);
  if (f.stage?.length) q = q.in("pipeline_stage", f.stage);
  if (f.projectId?.length) q = q.in("project_id", f.projectId);
  if (bySource) q = q.in("lead_sources.sources.code", f.sourceCode!);
  if (f.untouched) q = q.is("first_touch_at", null);
  if (f.slaBreached) q = q.not("sla_breached_at", "is", null);
  if (f.createdFrom) q = q.gte("created_at", `${f.createdFrom}T00:00:00+05:30`);
  if (f.createdTo) q = q.lte("created_at", `${f.createdTo}T23:59:59.999+05:30`);

  if (f.assignedTo === "me") q = q.eq("assigned_to", userId);
  else if (f.assignedTo === "none") q = q.is("assigned_to", null);
  else if (f.assignedTo === "team") {
    const ids = await teamIds(supabase, userId);
    q = q.in("assigned_to", ids.length ? ids : [NIL_UUID]);
  } else if (f.assignedTo?.startsWith("team:")) {
    // "team:<user id>": that person's whole book (themself and everyone below them), which is how
    // the dashboard's manager portfolios are counted. user_hierarchy includes the person at depth 0.
    const { data } = await supabase.from("user_hierarchy").select("descendant_id").eq("ancestor_id", f.assignedTo.slice(5));
    const ids = (data ?? []).map((r) => r.descendant_id);
    q = q.in("assigned_to", ids.length ? ids : [NIL_UUID]);
  } else if (f.assignedTo) q = q.eq("assigned_to", f.assignedTo);

  if (f.search) {
    const terms: string[] = [];
    const name = cleanName(f.search);
    const digits = f.search.replace(/\D/g, "");
    if (name) terms.push(`full_name.ilike.%${name}%`);
    if (digits.length >= 3) terms.push(`phone.ilike.%${digits}%`);
    if (terms.length) q = q.or(terms.join(","), { referencedTable: "persons" });
  }
  // Wrapped on purpose: the builder is a thenable, so returning it bare from an async function
  // would AWAIT it, run the query, and hand back a response instead of a builder.
  return { query: q };
}

export async function queryLeads(
  supabase: Client,
  userId: string,
  rawParams: unknown,
): Promise<ActionResult<{ rows: LeadRow[]; total: number }>> {
  const parsed = leadListParamsSchema.safeParse(rawParams ?? {});
  if (!parsed.success) return fail("Those filters are not valid. Reset them and try again.");
  const params: LeadListParams = parsed.data;
  const f = params.filters ?? {};

  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? DEFAULT_PAGE_SIZE;
  const [sortCol, sortDir] = (params.sort ?? "created_at:desc").split(":");

  let { query: q } = await filteredLeads(supabase, userId, f, listSelect(!!f.search), true);

  const from = (page - 1) * pageSize;
  // created_at is NOT NULL, and leaving out nullsFirst is what lets Postgres walk the
  // leads(created_at desc, id) index instead of sorting every visible row (1.5 s vs 55 ms at 20k).
  // The other sortable columns can be null, and there nulls go last.
  q = q
    .order(sortCol, sortCol === "created_at" ? { ascending: sortDir === "asc" } : { ascending: sortDir === "asc", nullsFirst: false })
    .order("id") // stable paging when the sort column ties
    .range(from, from + pageSize - 1);

  const { data, error, count } = await q;
  if (error) {
    console.error("[leads] list failed:", error.code, error.message);
    return fail("Could not load leads. Try again in a moment.");
  }
  return ok({ rows: (data as unknown as RawRow[]).map(mapRow), total: count ?? 0 });
}

// ---------------------------------------------------------------- detail

type RawDetail = RawRow & {
  person_id: string;
  budget_min: number | null;
  budget_max: number | null;
  notes: string | null;
  renurture_at: string | null;
  assigned_at: string | null;
  persons: { full_name: string | null; phone: string; email: string | null } | null;
  projects: { name: string; developer: string | null } | null;
  lead_sources: {
    received_at: string;
    campaign: string | null;
    sources: { code: string; name: string; is_live: boolean } | null;
  }[];
  lead_activities: {
    id: string;
    activity_type: string;
    remark: string | null;
    from_value: string | null;
    to_value: string | null;
    created_at: string;
    users: { full_name: string } | null;
  }[];
};

export async function queryLead(
  supabase: Client,
  leadId: string,
): Promise<ActionResult<LeadDetail>> {
  if (!/^[0-9a-f-]{36}$/i.test(leadId)) return fail(NO_ACCESS);

  const { data, error } = await supabase
    .from("leads")
    .select(
      [
        "id, person_id, project_id, call_status, temperature, pipeline_stage, is_live, assigned_to, assigned_at",
        "first_touch_at, last_activity_at, next_call_at, sla_due_at, sla_breached_at, renurture_at",
        "budget_min, budget_max, notes, created_at",
        "persons(full_name, phone, email)",
        "projects(name, developer)",
        "owner:users!leads_assigned_to_fkey(full_name)",
        "lead_sources(received_at, campaign, sources(code, name, is_live))",
        "lead_activities(id, activity_type, remark, from_value, to_value, created_at, users(full_name))",
      ].join(", "),
    )
    .eq("id", leadId)
    .order("received_at", { referencedTable: "lead_sources", ascending: false })
    .order("created_at", { referencedTable: "lead_activities", ascending: false })
    .limit(100, { referencedTable: "lead_activities" })
    .maybeSingle();

  if (error) {
    console.error("[leads] detail failed:", error.code, error.message);
    return fail("Could not load this lead. Try again in a moment.");
  }
  // RLS returns zero rows, not an error, for a lead the user may not read.
  if (!data) return fail(NO_ACCESS);

  const r = data as unknown as RawDetail;
  const sources: LeadSourceEntry[] = r.lead_sources
    .filter((s) => s.sources)
    .map((s) => ({
      code: s.sources!.code,
      name: s.sources!.name,
      isLive: s.sources!.is_live,
      campaign: s.campaign,
      receivedAt: s.received_at,
    }));
  const activities: LeadActivity[] = r.lead_activities.map((a) => ({
    id: a.id,
    activityType: a.activity_type,
    remark: a.remark,
    fromValue: a.from_value,
    toValue: a.to_value,
    createdAt: a.created_at,
    userName: a.users?.full_name ?? null,
  }));

  return ok({
    ...mapRow(r),
    personId: r.person_id,
    email: r.persons?.email ?? null,
    developer: r.projects?.developer ?? null,
    budgetMin: r.budget_min,
    budgetMax: r.budget_max,
    notes: r.notes,
    renurtureAt: r.renurture_at,
    assignedAt: r.assigned_at,
    sources,
    activities,
  });
}

// ---------------------------------------------------------------- call outcome

/**
 * Records what happened on a call. Rules come from schemas/lead.ts (shared with the form).
 *
 * Writes, in order: the lead's columns, then a lead_activities row. The activity insert is
 * what trips the database trigger that sets first_touch_at and stops the SLA clock —
 * this code never sets first_touch_at itself.
 * Pipeline moves are events (05-lead-flow.md): connected + hot/warm -> qualified, but only
 * from `enquiry` so a lead already further along is never pulled back; lost -> dropped.
 */
export async function applyCallOutcome(
  supabase: Client,
  userId: string,
  rawInput: unknown,
): Promise<ActionResult<null>> {
  const parsed = callOutcomeSchema.safeParse(rawInput);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the form and try again.");
  const input: CallOutcomeInput = parsed.data;

  const { data: current } = await supabase
    .from("leads")
    .select("call_status, pipeline_stage")
    .eq("id", input.leadId)
    .maybeSingle();
  if (!current) return fail(NO_ACCESS);

  const patch: Database["public"]["Tables"]["leads"]["Update"] = {
    call_status: input.callStatus,
    // temperature only exists while connected; the table CHECK rejects it otherwise
    temperature: input.callStatus === "connected" ? input.temperature : null,
  };
  if (input.nextCallAt) patch.next_call_at = input.nextCallAt;

  let newStage: typeof current.pipeline_stage | null = null;
  if (input.callStatus === "lost") {
    patch.renurture_at = input.renurtureAt ?? addMonths(new Date(), 6).toISOString();
    if (current.pipeline_stage !== "booked" && current.pipeline_stage !== "dropped") newStage = "dropped";
  } else if (
    input.callStatus === "connected" &&
    (input.temperature === "hot" || input.temperature === "warm") &&
    current.pipeline_stage === "enquiry"
  ) {
    newStage = "qualified";
  }
  if (newStage) patch.pipeline_stage = newStage;

  const { data: updated, error: updErr } = await supabase
    .from("leads")
    .update(patch)
    .eq("id", input.leadId)
    .select("id");
  if (updErr) {
    console.error("[leads] outcome update failed:", updErr.code, updErr.message);
    return fail(updErr.code === RLS_VIOLATION ? NO_ACCESS : "Could not save the call outcome. Try again.");
  }
  if (!updated?.length) return fail(NO_ACCESS);

  const activities: Database["public"]["Tables"]["lead_activities"]["Insert"][] = [
    {
      lead_id: input.leadId,
      user_id: userId,
      activity_type: "call",
      remark: input.remark || null,
      from_value: current.call_status,
      to_value: input.callStatus,
    },
  ];
  if (newStage) {
    activities.push({
      lead_id: input.leadId,
      user_id: userId,
      activity_type: "stage_change",
      from_value: current.pipeline_stage,
      to_value: newStage,
    });
  }
  const { error: actErr } = await supabase.from("lead_activities").insert(activities);
  if (actErr) {
    console.error("[leads] outcome activity failed:", actErr.code, actErr.message);
    return fail("The outcome was saved but its history entry was not. Submit it once more.");
  }
  return ok(null);
}

// ---------------------------------------------------------------- remark

/** A note on the timeline without changing status. Still counts as first touch. */
export async function insertRemark(
  supabase: Client,
  userId: string,
  rawInput: unknown,
): Promise<ActionResult<null>> {
  const parsed = addRemarkSchema.safeParse(rawInput);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Write a remark first.");

  const { error } = await supabase.from("lead_activities").insert({
    lead_id: parsed.data.leadId,
    user_id: userId,
    activity_type: "remark",
    remark: parsed.data.remark,
  });
  if (error) {
    // activities_insert policy: can_write_lead AND user_id = auth.uid()
    return fail(error.code === RLS_VIOLATION ? NO_ACCESS : "Could not save the remark. Try again.");
  }
  return ok(null);
}
