import { leadFiltersSchema, type LeadFilters } from "@/lib/schemas/lead";

// URL <-> lead-list state. Lists are driven by the URL so they are linkable, survive refresh,
// and stay server-rendered (no useEffect fetching). Keys:
//   q  status  temp  stage  project  owner  source  from  to  sla=1  untouched=1  page  sort

export type SearchParams = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const list = (v: string | string[] | undefined) =>
  first(v)?.split(",").map((s) => s.trim()).filter(Boolean);
const nonEmpty = <T>(a: T[] | undefined) => (a && a.length ? a : undefined);

export function parseLeadSearchParams(sp: SearchParams): {
  page: number;
  sort: string | undefined;
  filters: LeadFilters;
} {
  const raw = {
    search: first(sp.q),
    callStatus: nonEmpty(list(sp.status)),
    temperature: nonEmpty(list(sp.temp)),
    stage: nonEmpty(list(sp.stage)),
    projectId: nonEmpty(list(sp.project)),
    assignedTo: first(sp.owner),
    sourceCode: nonEmpty(list(sp.source)),
    createdFrom: first(sp.from),
    createdTo: first(sp.to),
    slaBreached: first(sp.sla) === "1" ? true : undefined,
    untouched: first(sp.untouched) === "1" ? true : undefined,
  };
  // A hand-edited or stale URL must not crash the page: fall back to "no filters".
  const parsed = leadFiltersSchema.safeParse(raw);
  const page = Number.parseInt(first(sp.page) ?? "1", 10);
  return {
    page: Number.isFinite(page) && page >= 1 ? page : 1,
    sort: first(sp.sort),
    filters: parsed.success ? parsed.data : {},
  };
}

/**
 * Builds a query string from the current params plus a patch. `undefined` or "" removes a key.
 * Changing anything except `page` resets to page 1.
 */
export function withParams(current: SearchParams, patch: Record<string, string | undefined>): string {
  const next = new URLSearchParams();
  for (const [k, v] of Object.entries(current)) {
    const s = first(v);
    if (s) next.set(k, s);
  }
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined || v === "") next.delete(k);
    else next.set(k, v);
  }
  if (!("page" in patch)) next.delete("page");
  const s = next.toString();
  return s ? `?${s}` : "?";
}
