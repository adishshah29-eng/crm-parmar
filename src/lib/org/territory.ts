import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { fail, ok, type ActionResult } from "@/types/action";
import type { Actor } from "@/lib/org/mutations";
import { callRpc } from "@/lib/supabase/rpc";
import {
  createLocationSchema,
  createProjectSchema,
  setScopesSchema,
  updateLocationSchema,
  updateProjectSchema,
} from "@/lib/schemas/territory";

// Territories, projects and locations (tasks A2.1, A2.2). Pure functions over a session-bound
// client: RLS (scopes_write / projects_write / locations_write = app.is_super()) is the real
// permission check; the actor.role test is only a better error message.
//
// Overlap is ALLOWED by design (D-003): two managers may share a project or a location. So the
// overlap check returns warnings for the editor to show, and never blocks a save.

type Client = SupabaseClient<Database>;

const ONLY_SUPER = "Only the super admin can change territories, projects and locations.";
const MIGRATION_MISSING = "This needs migration 0007, which has not been applied to this database. Ask Adish to run db push.";

export type LocationRow = { id: string; name: string; city: string };
export type ProjectRow = { id: string; name: string; locationId: string; developer: string | null; isActive: boolean };
export type Catalog = { locations: LocationRow[]; projects: ProjectRow[] };
export type ManagerScopes = {
  userId: string;
  fullName: string;
  isActive: boolean;
  projectIds: string[];
  locationIds: string[];
};

// ---------------------------------------------------------------- reads

export async function queryCatalog(supabase: Client): Promise<ActionResult<Catalog>> {
  const [locs, projs] = await Promise.all([
    supabase.from("locations").select("id, name, city").order("city").order("name"),
    supabase.from("projects").select("id, name, location_id, developer, is_active").order("name"),
  ]);
  if (locs.error || projs.error) {
    console.error("[territory] catalog failed:", locs.error?.code ?? projs.error?.code);
    return fail("Could not load projects and locations. Try again in a moment.");
  }
  return ok({
    locations: locs.data.map((l) => ({ id: l.id, name: l.name, city: l.city })),
    projects: projs.data.map((p) => ({
      id: p.id,
      name: p.name,
      locationId: p.location_id,
      developer: p.developer,
      isActive: p.is_active,
    })),
  });
}

/** Every manager with their scope rows. Sub-managers and callers have none (they inherit). */
export async function queryManagerScopes(supabase: Client): Promise<ActionResult<ManagerScopes[]>> {
  const { data, error } = await supabase
    .from("users")
    .select("id, full_name, is_active, user_scopes(project_id, location_id)")
    .eq("role", "manager")
    .order("full_name");
  if (error) {
    console.error("[territory] scopes failed:", error.code, error.message);
    return fail("Could not load territories. Try again in a moment.");
  }
  return ok(
    data.map((m) => ({
      userId: m.id,
      fullName: m.full_name,
      isActive: m.is_active,
      projectIds: m.user_scopes.flatMap((s) => (s.project_id ? [s.project_id] : [])),
      locationIds: m.user_scopes.flatMap((s) => (s.location_id ? [s.location_id] : [])),
    })),
  );
}

/** Leads per project, for the catalog screen. One cheap count per project; there are a handful. RLS applies. */
export async function queryProjectLeadCounts(supabase: Client, projectIds: string[]): Promise<Record<string, number>> {
  const entries = await Promise.all(
    projectIds.map(async (id) => {
      const { count } = await supabase.from("leads").select("id", { count: "exact", head: true }).eq("project_id", id);
      return [id, count ?? 0] as const;
    }),
  );
  return Object.fromEntries(entries);
}

export function distinctCities(catalog: Catalog): string[] {
  return [...new Set(catalog.locations.map((l) => l.city))].sort();
}

// ---------------------------------------------------------------- coverage and overlap (pure)

/** Project ids a manager covers: named directly, plus every project inside a location they hold. */
export function coveredProjectIds(m: Pick<ManagerScopes, "projectIds" | "locationIds">, catalog: Catalog): Set<string> {
  const set = new Set(m.projectIds);
  const locs = new Set(m.locationIds);
  for (const p of catalog.projects) if (locs.has(p.locationId)) set.add(p.id);
  return set;
}

export type ProjectCoverage = { project: ProjectRow; managers: { userId: string; fullName: string }[] };

/** For the overview: who covers each project. Inactive managers do not count as coverage. */
export function projectCoverage(catalog: Catalog, managers: ManagerScopes[]): ProjectCoverage[] {
  const active = managers.filter((m) => m.isActive).map((m) => ({ m, covers: coveredProjectIds(m, catalog) }));
  return catalog.projects.map((project) => ({
    project,
    managers: active.filter((a) => a.covers.has(project.id)).map((a) => ({ userId: a.m.userId, fullName: a.m.fullName })),
  }));
}

export type OverlapWarning = {
  kind: "project" | "location";
  id: string;
  name: string;
  /** Other active managers who also cover it, and how. */
  others: { userId: string; fullName: string; via: string }[];
};
export type RedundantScope = { projectId: string; projectName: string; locationName: string };

/**
 * What would overlap if `managerId` covered exactly this selection? Only ACTIVE other managers
 * count. A warning, never an error: overlap is legitimate, the warning makes it deliberate.
 */
export function computeOverlaps(input: {
  managerId: string;
  projectIds: string[];
  locationIds: string[];
  catalog: Catalog;
  managers: ManagerScopes[];
}): { overlaps: OverlapWarning[]; redundant: RedundantScope[] } {
  const { managerId, catalog } = input;
  const others = input.managers.filter((m) => m.isActive && m.userId !== managerId);
  const projName = new Map(catalog.projects.map((p) => [p.id, p.name]));
  const locById = new Map(catalog.locations.map((l) => [l.id, l]));
  const projectsIn = (locationId: string) => catalog.projects.filter((p) => p.locationId === locationId);
  const selectedLocations = new Set(input.locationIds);

  const overlaps: OverlapWarning[] = [];

  for (const locationId of input.locationIds) {
    const loc = locById.get(locationId);
    if (!loc) continue;
    const inside = new Set(projectsIn(locationId).map((p) => p.id));
    const hits: OverlapWarning["others"] = [];
    for (const o of others) {
      if (o.locationIds.includes(locationId)) {
        hits.push({ userId: o.userId, fullName: o.fullName, via: "also holds the whole location" });
        continue;
      }
      const shared = o.projectIds.filter((id) => inside.has(id)).map((id) => projName.get(id) ?? "a project");
      if (shared.length) hits.push({ userId: o.userId, fullName: o.fullName, via: `covers ${shared.join(", ")} here` });
    }
    if (hits.length) overlaps.push({ kind: "location", id: locationId, name: `${loc.name} (${loc.city})`, others: hits });
  }

  for (const projectId of input.projectIds) {
    const project = catalog.projects.find((p) => p.id === projectId);
    if (!project) continue;
    // A project inside a selected location is already covered by that location's warning.
    if (selectedLocations.has(project.locationId)) continue;
    const hits: OverlapWarning["others"] = [];
    for (const o of others) {
      if (o.projectIds.includes(projectId)) hits.push({ userId: o.userId, fullName: o.fullName, via: "also holds this project" });
      else if (o.locationIds.includes(project.locationId)) hits.push({ userId: o.userId, fullName: o.fullName, via: "holds its whole location" });
    }
    if (hits.length) overlaps.push({ kind: "project", id: projectId, name: project.name, others: hits });
  }

  const redundant: RedundantScope[] = input.projectIds.flatMap((projectId) => {
    const project = catalog.projects.find((p) => p.id === projectId);
    if (!project || !selectedLocations.has(project.locationId)) return [];
    return [{ projectId, projectName: project.name, locationName: locById.get(project.locationId)?.name ?? "" }];
  });

  return { overlaps, redundant };
}

// ---------------------------------------------------------------- set a manager's territory (A2.1)

export async function setScopesCore(supabase: Client, actor: Actor, rawInput: unknown): Promise<ActionResult<null>> {
  if (actor.role !== "super_admin") return fail(ONLY_SUPER);
  const parsed = setScopesSchema.safeParse(rawInput);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the selection and try again.");
  const { userId } = parsed.data;
  const projectIds = [...new Set(parsed.data.projectIds)];
  const locationIds = [...new Set(parsed.data.locationIds)];

  const { data: target } = await supabase.from("users").select("id, role, is_active").eq("id", userId).maybeSingle();
  if (!target) return fail("That user does not exist.");
  // Only managers hold territory. Sub-managers and callers inherit their manager's (D-004).
  if (target.role !== "manager") return fail("Only managers hold a territory. Sub-managers and callers inherit their manager's.");
  if (!target.is_active) return fail("That manager is deactivated.");

  // Fail with a plain message instead of a foreign-key error if a project or location vanished.
  const [projs, locs] = await Promise.all([
    projectIds.length ? supabase.from("projects").select("id").in("id", projectIds) : Promise.resolve({ data: [], error: null }),
    locationIds.length ? supabase.from("locations").select("id").in("id", locationIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (projs.error || locs.error) return fail("Could not check the selection. Try again.");
  if ((projs.data?.length ?? 0) !== projectIds.length || (locs.data?.length ?? 0) !== locationIds.length) {
    return fail("One of the selected projects or locations no longer exists. Reload and try again.");
  }

  const { error } = await callRpc<null>(supabase, "set_user_scopes", {
    p_user: userId,
    p_projects: projectIds,
    p_locations: locationIds,
  });
  if (error) {
    console.error("[territory] set_user_scopes failed:", error.code, error.message);
    if (error.code === "PGRST202") return fail(MIGRATION_MISSING);
    if (error.code === "42501") return fail(ONLY_SUPER);
    if (error.code === "22023") return fail("Only managers hold a territory.");
    return fail("Could not save the territory. Nothing was changed.");
  }
  return ok(null);
}

// ---------------------------------------------------------------- locations and projects (A2.2)
// Never deleted: leads and history point at them. Projects can be deactivated instead.

/** Reuse the spelling of an existing city so "mumbai" and "Mumbai" never become two cities. */
async function canonicalCity(supabase: Client, city: string): Promise<string> {
  const { data } = await supabase.from("locations").select("city");
  const existing = [...new Set((data ?? []).map((r) => r.city))];
  return existing.find((c) => c.toLowerCase() === city.toLowerCase()) ?? city;
}

export async function createLocationCore(supabase: Client, actor: Actor, rawInput: unknown): Promise<ActionResult<{ locationId: string }>> {
  if (actor.role !== "super_admin") return fail(ONLY_SUPER);
  const parsed = createLocationSchema.safeParse(rawInput);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the form and try again.");

  const city = await canonicalCity(supabase, parsed.data.city);
  const { data, error } = await supabase.from("locations").insert({ name: parsed.data.name, city }).select("id").single();
  if (error) {
    if (error.code === "23505") return fail(`${parsed.data.name} already exists in ${city}.`);
    console.error("[territory] create location failed:", error.code, error.message);
    return fail("Could not create the location. Try again.");
  }
  return ok({ locationId: data.id });
}

export async function updateLocationCore(supabase: Client, actor: Actor, rawInput: unknown): Promise<ActionResult<null>> {
  if (actor.role !== "super_admin") return fail(ONLY_SUPER);
  const parsed = updateLocationSchema.safeParse(rawInput);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the form and try again.");

  const city = await canonicalCity(supabase, parsed.data.city);
  const { data, error } = await supabase
    .from("locations")
    .update({ name: parsed.data.name, city })
    .eq("id", parsed.data.locationId)
    .select("id");
  if (error) {
    if (error.code === "23505") return fail(`${parsed.data.name} already exists in ${city}.`);
    console.error("[territory] update location failed:", error.code, error.message);
    return fail("Could not save the location. Try again.");
  }
  if (!data?.length) return fail("Could not save the location. It may no longer exist.");
  return ok(null);
}

export async function createProjectCore(supabase: Client, actor: Actor, rawInput: unknown): Promise<ActionResult<{ projectId: string }>> {
  if (actor.role !== "super_admin") return fail(ONLY_SUPER);
  const parsed = createProjectSchema.safeParse(rawInput);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the form and try again.");

  const { data, error } = await supabase
    .from("projects")
    .insert({ name: parsed.data.name, location_id: parsed.data.locationId, developer: parsed.data.developer || null })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") return fail(`A project called ${parsed.data.name} already exists.`);
    if (error.code === "23503") return fail("That location no longer exists. Reload and try again.");
    console.error("[territory] create project failed:", error.code, error.message);
    return fail("Could not create the project. Try again.");
  }
  return ok({ projectId: data.id });
}

export async function updateProjectCore(supabase: Client, actor: Actor, rawInput: unknown): Promise<ActionResult<null>> {
  if (actor.role !== "super_admin") return fail(ONLY_SUPER);
  const parsed = updateProjectSchema.safeParse(rawInput);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the form and try again.");
  const v = parsed.data;

  // A moved project's leads follow it: trigger projects_sync_lead_location (migration 0007).
  const { data, error } = await supabase
    .from("projects")
    .update({ name: v.name, location_id: v.locationId, developer: v.developer || null, is_active: v.isActive })
    .eq("id", v.projectId)
    .select("id");
  if (error) {
    if (error.code === "23505") return fail(`A project called ${v.name} already exists.`);
    if (error.code === "23503") return fail("That location no longer exists. Reload and try again.");
    console.error("[territory] update project failed:", error.code, error.message);
    return fail("Could not save the project. Try again.");
  }
  if (!data?.length) return fail("Could not save the project. It may no longer exist.");
  return ok(null);
}
