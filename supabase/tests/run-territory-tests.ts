// run-territory-tests.ts — territories, projects, assignment and exit transfer (tasks A2.1-A2.4).
//
//   npm run test:territory
//
// Needs .env.local, the seed, and migration 0007 for the parts marked (0007). Those are SKIPPED,
// not failed, when 0007 has not been applied yet, so you can run this before `db push`.
//
// It temporarily changes some mock data (a manager's territory, one unassigned lead's owner, a
// temporary project/location/lead) and RESTORES it afterwards. Ownership-history rows and
// notifications are append-only, so a few remain. Never run this against real data.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { bulkAssignCore, reassignCore } from "../../src/lib/leads/assign";
import {
  computeOverlaps,
  createLocationCore,
  createProjectCore,
  projectCoverage,
  queryCatalog,
  queryManagerScopes,
  setScopesCore,
  updateLocationCore,
  updateProjectCore,
  type Catalog,
  type ManagerScopes,
} from "../../src/lib/org/territory";
import { nearestSuperior, planExitTransfer, planMoves } from "../../src/lib/org/transfer";
import { callRpc } from "../../src/lib/supabase/rpc";
import { dbNow } from "./db-clock";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!URL || !KEY) throw new Error("Missing Supabase URL / anon key in .env.local");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any>;

async function signIn(email: string) {
  const c: Client = createClient(URL, KEY, { auth: { persistSession: false } });
  const { data, error } = await c.auth.signInWithPassword({ email, password: "Test@12345" });
  if (error) throw new Error(`sign in failed for ${email}: ${error.message}`);
  return { c, id: data.user.id };
}

let failed = 0;
let skipped = 0;
function check(name: string, passed: boolean, detail = "") {
  if (!passed) failed++;
  console.log(`${passed ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
}
function skip(name: string, why: string) {
  skipped++;
  console.log(`SKIP  ${name}  — ${why}`);
}

const PROJ = {
  raheja: "22222222-0000-0000-0000-000000000001",
  bellevue: "22222222-0000-0000-0000-000000000002",
  runwal: "22222222-0000-0000-0000-000000000003",
  aureus: "22222222-0000-0000-0000-000000000005",
  rivana: "22222222-0000-0000-0000-000000000006",
};

async function main() {
  // ================================================== A. overlap and coverage (pure)
  const cat: Catalog = {
    locations: [
      { id: "L1", name: "Worli", city: "Mumbai" },
      { id: "L2", name: "Punawale", city: "Pune" },
    ],
    projects: [
      { id: "P1", name: "Alpha", locationId: "L1", developer: null, isActive: true },
      { id: "P2", name: "Beta", locationId: "L1", developer: null, isActive: true },
      { id: "P3", name: "Gamma", locationId: "L2", developer: null, isActive: true },
    ],
  };
  const mgr = (userId: string, fullName: string, projectIds: string[], locationIds: string[], isActive = true): ManagerScopes => ({ userId, fullName, isActive, projectIds, locationIds });
  const A = mgr("A", "Anita", [], ["L1"]); // holds the whole Worli location
  const B = mgr("B", "Bharat", ["P1"], []); // holds Alpha only
  const C = mgr("C", "Chetan", ["P1"], [], false); // inactive: must never count
  const managers = [A, B, C];

  const oP1 = computeOverlaps({ managerId: "X", projectIds: ["P1"], locationIds: [], catalog: cat, managers });
  check("overlap: a project held by others warns, naming who and how", oP1.overlaps.length === 1 && oP1.overlaps[0].others.map((o) => o.fullName).sort().join() === "Anita,Bharat", JSON.stringify(oP1.overlaps[0]?.others.map((o) => o.fullName)));
  check("overlap: an inactive manager is ignored", !oP1.overlaps[0]?.others.some((o) => o.fullName === "Chetan"));
  check("overlap: holds-the-whole-location is described as such", oP1.overlaps[0]?.others.find((o) => o.fullName === "Anita")?.via === "holds its whole location");

  const oL1 = computeOverlaps({ managerId: "X", projectIds: [], locationIds: ["L1"], catalog: cat, managers });
  check("overlap: a location warns when another manager holds it or a project in it", oL1.overlaps.length === 1 && oL1.overlaps[0].others.length === 2, oL1.overlaps[0]?.others.map((o) => `${o.fullName} ${o.via}`).join("; "));

  const oBoth = computeOverlaps({ managerId: "X", projectIds: ["P1"], locationIds: ["L1"], catalog: cat, managers });
  check("overlap: a project inside a selected location is not warned twice", oBoth.overlaps.length === 1 && oBoth.overlaps[0].kind === "location");
  check("overlap: that project is reported as redundant instead", oBoth.redundant.length === 1 && oBoth.redundant[0].projectId === "P1");

  const oClear = computeOverlaps({ managerId: "X", projectIds: ["P3"], locationIds: [], catalog: cat, managers });
  check("overlap: an uncovered project gives no warning", oClear.overlaps.length === 0);
  const oSelf = computeOverlaps({ managerId: "A", projectIds: [], locationIds: ["L1"], catalog: cat, managers });
  check("overlap: a manager never overlaps with their own saved territory", oSelf.overlaps.every((o) => o.others.every((x) => x.userId !== "A")));

  const cov = projectCoverage(cat, managers);
  check("coverage: shared project lists both managers, inactive excluded", cov.find((c) => c.project.id === "P1")!.managers.map((m) => m.fullName).sort().join() === "Anita,Bharat");
  check("coverage: a project nobody active covers is flagged", cov.find((c) => c.project.id === "P3")!.managers.length === 0);

  // ================================================== B. exit-transfer placement (pure)
  const lead = (id: string, projectId: string, locationId = "L1") => ({ id, projectId, locationId });
  const M1 = { userId: "m1", fullName: "One", projectIds: new Set(["P1"]), locationIds: new Set<string>() };
  const M2 = { userId: "m2", fullName: "Two", projectIds: new Set(["P1"]), locationIds: new Set<string>() };
  const M3 = { userId: "m3", fullName: "Three", projectIds: new Set<string>(), locationIds: new Set(["L2"]) };
  const boss = { userId: "boss", fullName: "Boss", role: "manager" as const };

  const shared = planMoves({ leads: ["a", "b", "c", "d", "e"].map((id) => lead(id, "P1")), managers: [M1, M2], fallback: boss });
  const perMgr = Object.fromEntries(shared.receivers.map((r) => [r.userId, r.count]));
  check("transfer: a shared territory is spread evenly (5 leads -> 3 and 2)", perMgr.m1 + perMgr.m2 === 5 && Math.abs(perMgr.m1 - perMgr.m2) === 1, JSON.stringify(perMgr));
  const again = planMoves({ leads: ["e", "d", "c", "b", "a"].map((id) => lead(id, "P1")), managers: [M2, M1], fallback: boss });
  check("transfer: the same inputs always give the same plan, whatever the input order", JSON.stringify(again.moves) === JSON.stringify(shared.moves));

  const byLoc = planMoves({ leads: [lead("x", "P9", "L2")], managers: [M1, M3], fallback: boss });
  check("transfer: a manager holding the whole location covers its projects", byLoc.moves[0]?.toUserId === "m3");
  const none = planMoves({ leads: [lead("y", "P9", "L9")], managers: [M1, M2, M3], fallback: boss });
  check("transfer: nobody covers it -> the fallback, marked as such", none.moves[0]?.toUserId === "boss" && none.receivers[0]?.fallback === true);
  const mixed = planMoves({ leads: [lead("a", "P1"), lead("z", "P9", "L9")], managers: [M1], fallback: boss });
  check("transfer: covered and uncovered leads in one batch each go to the right place", mixed.moves.find((m) => m.leadId === "a")?.toUserId === "m1" && mixed.moves.find((m) => m.leadId === "z")?.toUserId === "boss");
  const noFallback = planMoves({ leads: [lead("y", "P9", "L9")], managers: [M1], fallback: null });
  check("transfer: with no fallback an uncovered lead is left out, so the caller can refuse", noFallback.moves.length === 0);

  const org = [
    { id: "adm", fullName: "Admin", role: "admin" as const, isActive: true, parentId: null },
    { id: "mgr", fullName: "Mgr", role: "manager" as const, isActive: true, parentId: "adm" },
    { id: "sub", fullName: "Sub", role: "sub_manager" as const, isActive: true, parentId: "mgr" },
    { id: "cal", fullName: "Cal", role: "caller" as const, isActive: true, parentId: "sub" },
  ];
  check("superior: a caller under a sub_manager falls back to the MANAGER above", nearestSuperior("cal", org)?.userId === "mgr");
  check("superior: a manager falls back to the admin above", nearestSuperior("mgr", org)?.userId === "adm");
  check("superior: an inactive manager is skipped", nearestSuperior("cal", org.map((u) => (u.id === "mgr" ? { ...u, isActive: false } : u)))?.userId === "sub");
  check("superior: nobody above -> null", nearestSuperior("adm", org) === null);

  // ================================================== C. live: reads and permission
  const sup = await signIn("super@parmar.test");
  const adm = await signIn("admin1@parmar.test");
  const c1 = await signIn("caller1@parmar.test");
  const c2 = await signIn("caller2@parmar.test");
  const c3 = await signIn("caller3@parmar.test");
  const mw = await signIn("mgr.worli@parmar.test");
  const mp = await signIn("mgr.pune@parmar.test");
  const sub = await signIn("sub.worli@parmar.test");
  const superActor = { id: sup.id, role: "super_admin" as const };
  const adminActor = { id: adm.id, role: "admin" as const };

  const catalog = await queryCatalog(sup.c);
  check("catalog: all six seeded projects and their locations load", catalog.ok && catalog.data.projects.length >= 6 && catalog.data.locations.length >= 5, catalog.ok ? `${catalog.data.projects.length} projects` : catalog.error);
  const scopes = await queryManagerScopes(sup.c);
  const worli = scopes.ok ? scopes.data.find((m) => m.userId === mw.id) : undefined;
  const pune = scopes.ok ? scopes.data.find((m) => m.userId === mp.id) : undefined;
  check("scopes: Worli holds two projects, Pune holds a location", worli?.projectIds.length === 2 && pune?.locationIds.length === 1);
  if (catalog.ok && scopes.ok) {
    const live = projectCoverage(catalog.data, scopes.data);
    const unmanaged = live.filter((c) => c.managers.length === 0).map((c) => c.project.name).sort();
    check("coverage (live): the three projects the seed leaves without a manager are flagged", unmanaged.length === 3 && unmanaged.includes("Runwal 7 Mahalaxmi"), unmanaged.join(", "));
  }

  const denied = [
    ["admin", await createProjectCore(sup.c, adminActor, { name: "Nope Project", locationId: "11111111-0000-0000-0000-000000000001" })],
    ["admin", await setScopesCore(sup.c, adminActor, { userId: mw.id, projectIds: [], locationIds: [] })],
    ["admin", await createLocationCore(sup.c, adminActor, { name: "Nope", city: "Mumbai" })],
  ] as const;
  check("permission: an admin cannot create projects, locations or change territories", denied.every(([, r]) => !r.ok));
  const forged = await createProjectCore(adm.c, superActor, { name: "Forged Project", locationId: "11111111-0000-0000-0000-000000000001" });
  const { data: leaked } = await sup.c.from("projects").select("id").eq("name", "Forged Project");
  check("permission: RLS refuses a project insert even with a forged super_admin actor", !forged.ok && (leaked ?? []).length === 0, forged.ok ? "INSERT SUCCEEDED" : forged.error);
  const forgedLoc = await createLocationCore(c1.c, superActor, { name: "Forged Location", city: "Mumbai" });
  check("permission: a caller cannot create a location either", !forgedLoc.ok);

  // ================================================== D. live: locations and projects (no 0007 needed, except the sync trigger)
  const stamp = Date.now().toString(36);
  const locName = `ZZ Test ${stamp}`;
  let locA = "";
  let locB = "";
  let projId = "";
  let personId = "";
  let leadId = "";
  try {
    const l1 = await createLocationCore(sup.c, superActor, { name: locName, city: "mumbai" });
    locA = l1.ok ? l1.data.locationId : "";
    const { data: locRow } = await sup.c.from("locations").select("city").eq("id", locA).maybeSingle();
    check("location: created, and the city reuses the existing spelling (mumbai -> Mumbai)", l1.ok && locRow?.city === "Mumbai", locRow?.city ?? (l1.ok ? "" : l1.error));
    const dupLoc = await createLocationCore(sup.c, superActor, { name: locName, city: "MUMBAI" });
    check("location: a duplicate gets a plain message", !dupLoc.ok && /already exists/.test(dupLoc.error), dupLoc.ok ? "" : dupLoc.error);
    const l2 = await createLocationCore(sup.c, superActor, { name: `${locName} B`, city: "Mumbai" });
    locB = l2.ok ? l2.data.locationId : "";
    const renamed = await updateLocationCore(sup.c, superActor, { locationId: locB, name: `${locName} B2`, city: "Mumbai" });
    check("location: rename works", renamed.ok, renamed.ok ? "" : renamed.error);

    const p = await createProjectCore(sup.c, superActor, { name: `ZZ Proj ${stamp}`, locationId: locA, developer: "  Test Dev  " });
    projId = p.ok ? p.data.projectId : "";
    const { data: projRow } = await sup.c.from("projects").select("developer, is_active, location_id").eq("id", projId).maybeSingle();
    check("project: created with a trimmed developer, active by default", p.ok && projRow?.developer === "Test Dev" && projRow?.is_active === true, p.ok ? "" : p.error);
    const dupProj = await createProjectCore(sup.c, superActor, { name: `ZZ Proj ${stamp}`, locationId: locA });
    check("project: a duplicate name gets a plain message", !dupProj.ok && /already exists/.test(dupProj.error), dupProj.ok ? "" : dupProj.error);
    const noLoc = await createProjectCore(sup.c, superActor, { name: `ZZ Ghost ${stamp}`, locationId: crypto.randomUUID() });
    check("project: an unknown location is refused with a plain message", !noLoc.ok && /no longer exists/.test(noLoc.error), noLoc.ok ? "" : noLoc.error);
    const off = await updateProjectCore(sup.c, superActor, { projectId: projId, name: `ZZ Proj ${stamp}`, locationId: locA, developer: "", isActive: false });
    const { data: offRow } = await sup.c.from("projects").select("is_active, developer").eq("id", projId).maybeSingle();
    check("project: can be deactivated (never deleted), blank developer stored as null", off.ok && offRow?.is_active === false && offRow?.developer === null);
    const on = await updateProjectCore(sup.c, superActor, { projectId: projId, name: `ZZ Proj ${stamp}`, locationId: locA, developer: "", isActive: true });
    check("project: can be reactivated", on.ok);

    // (0007) a project's leads follow it when it moves to another location
    const { data: person } = await sup.c.from("persons").insert({ phone: `+9199${Math.floor(10000000 + Math.random() * 89999999)}`, full_name: "ZZ Test Buyer" }).select("id").single();
    personId = person?.id ?? "";
    const { data: lead } = await sup.c.from("leads").insert({ person_id: personId, project_id: projId, location_id: locA }).select("id").single();
    leadId = lead?.id ?? "";
    const move = await updateProjectCore(sup.c, superActor, { projectId: projId, name: `ZZ Proj ${stamp}`, locationId: locB, developer: "", isActive: true });
    const { data: leadRow } = await sup.c.from("leads").select("location_id").eq("id", leadId).maybeSingle();
    if (move.ok && leadRow?.location_id === locB) check("project: moving it moves its leads' location too (0007 trigger)", true);
    else if (move.ok && leadRow?.location_id === locA) skip("project: moving it moves its leads' location too", "migration 0007 not applied — the trigger does not exist yet");
    else check("project: moving it moves its leads' location too (0007 trigger)", false, move.ok ? "" : move.error);
  } finally {
    // tidy up everything this section created (super_admin may delete; nothing else references these)
    if (leadId) await sup.c.from("leads").delete().eq("id", leadId);
    if (personId) await sup.c.from("persons").delete().eq("id", personId);
    if (projId) await sup.c.from("projects").delete().eq("id", projId);
    for (const id of [locA, locB]) if (id) await sup.c.from("locations").delete().eq("id", id);
    const { data: left } = await sup.c.from("locations").select("id").like("name", "ZZ Test%");
    check("cleanup: the temporary project, location, person and lead are gone", (left ?? []).length === 0, `${left?.length ?? 0} left`);
  }

  // ================================================== E. live: territory changes (0007)
  const probe = await callRpc<null>(sup.c, "set_user_scopes", { p_user: mw.id, p_projects: worli?.projectIds ?? [], p_locations: worli?.locationIds ?? [] });
  const has0007 = probe.error?.code !== "PGRST202";
  if (!has0007) {
    skip("territory editor: save, overlap warning, atomic replace, permission", "migration 0007 not applied — run `npx supabase db push`");
    skip("assignment: bulk assign, history, SLA, notification, permission", "migration 0007 not applied");
    skip("exit transfer: applying the plan", "migration 0007 not applied");
  } else {
    check("set_user_scopes: re-saving the same territory is a harmless no-op", !probe.error, probe.error?.message ?? "");

    const original = { projectIds: pune?.projectIds ?? [], locationIds: pune?.locationIds ?? [] };
    try {
      const warn = computeOverlaps({ managerId: mp.id, projectIds: [...original.projectIds, PROJ.bellevue], locationIds: original.locationIds, catalog: catalog.ok ? catalog.data : cat, managers: scopes.ok ? scopes.data : [] });
      check("editor (live): giving Pune the Bellevue project warns that Worli also holds it", warn.overlaps.some((o) => o.name === "Lodha Bellevue" && o.others.some((x) => x.fullName === "Manager Worli")));

      const saved = await setScopesCore(sup.c, superActor, { userId: mp.id, projectIds: [...original.projectIds, PROJ.bellevue], locationIds: original.locationIds });
      check("editor: an overlapping territory SAVES (it is a warning, not an error)", saved.ok, saved.ok ? "" : saved.error);
      const { data: rows } = await sup.c.from("user_scopes").select("project_id, location_id").eq("user_id", mp.id);
      check("editor: the new scope row exists and the old one is untouched", (rows ?? []).some((r) => r.project_id === PROJ.bellevue) && (rows ?? []).some((r) => r.location_id === original.locationIds[0]));
      const { data: seenByPune } = await mp.c.from("leads").select("id").eq("project_id", PROJ.bellevue).limit(1);
      check("editor: the new manager can now SEE leads in that project (visibility follows immediately)", (seenByPune ?? []).length === 1);

      // exit transfer, shared territory: Bellevue is now held by BOTH managers
      const leaverPlan = await planExitTransfer(sup.c, c1.id);
      const leaverPlan2 = await planExitTransfer(sup.c, c2.id);
      const plans = [leaverPlan, leaverPlan2].filter((p) => p.ok && p.data.openLeads > 0);
      check("exit transfer (live): a plan is produced for callers with open leads", plans.length > 0);
      for (const [who, plan] of [["caller1", leaverPlan], ["caller2", leaverPlan2]] as const) {
        if (!plan.ok || plan.data.moves.length === 0) continue;
        const { data: theirs } = await sup.c.from("leads").select("id, project_id, location_id").in("id", plan.data.moves.map((m) => m.leadId));
        const byId = new Map((theirs ?? []).map((l) => [l.id, l]));
        const bellevue = plan.data.moves.filter((m) => byId.get(m.leadId)?.project_id === PROJ.bellevue);
        const counts = new Map<string, number>();
        for (const m of bellevue) counts.set(m.toUserId, (counts.get(m.toUserId) ?? 0) + 1);
        const spread = [...counts.values()];
        if (bellevue.length >= 2) {
          check(`exit transfer (live): ${who}'s Bellevue leads are shared by both managers who now hold it, evenly`, counts.has(mw.id) && counts.has(mp.id) && Math.max(...spread) - Math.min(...spread) <= 1, JSON.stringify([...counts.entries()].map(([k, v]) => [k === mw.id ? "worli" : k === mp.id ? "pune" : k.slice(0, 4), v])));
        }
        check(`exit transfer (live): every one of ${who}'s open leads gets a receiver`, plan.data.moves.length === plan.data.openLeads);
      }
    } finally {
      const back = await setScopesCore(sup.c, superActor, { userId: mp.id, ...original });
      const { data: rows } = await sup.c.from("user_scopes").select("project_id, location_id").eq("user_id", mp.id);
      check("editor: restoring the original territory works, nothing left over", back.ok && (rows ?? []).length === original.projectIds.length + original.locationIds.length && !(rows ?? []).some((r) => r.project_id === PROJ.bellevue), `${rows?.length} rows`);
    }

    // atomic: a failing call must leave the territory exactly as it was
    const before = await sup.c.from("user_scopes").select("id").eq("user_id", mw.id);
    const boom = await callRpc<null>(sup.c, "set_user_scopes", { p_user: mw.id, p_projects: [crypto.randomUUID()], p_locations: [] });
    const after = await sup.c.from("user_scopes").select("id").eq("user_id", mw.id);
    check("set_user_scopes: a failing call rolls back the whole replacement", !!boom.error && (before.data ?? []).length === (after.data ?? []).length && (after.data ?? []).length > 0, `${before.data?.length} rows before, ${after.data?.length} after`);

    const notSuper = await callRpc<null>(mw.c, "set_user_scopes", { p_user: mw.id, p_projects: [], p_locations: [] });
    const stillThere = await sup.c.from("user_scopes").select("id").eq("user_id", mw.id);
    check("set_user_scopes: a manager cannot change their own territory (42501)", notSuper.error?.code === "42501" && (stillThere.data ?? []).length > 0, notSuper.error?.code ?? "CALL SUCCEEDED");
    const forCaller = await setScopesCore(sup.c, superActor, { userId: c1.id, projectIds: [PROJ.raheja], locationIds: [] });
    check("editor: only managers hold a territory (a caller is refused)", !forCaller.ok && /Only managers/.test(forCaller.error));
    const ghost = await setScopesCore(sup.c, superActor, { userId: mp.id, projectIds: [crypto.randomUUID()], locationIds: [] });
    const puneStill = await sup.c.from("user_scopes").select("id").eq("user_id", mp.id);
    check("editor: a project that no longer exists is refused with a plain message, nothing changed", !ghost.ok && /no longer exists/.test(ghost.error) && (puneStill.data ?? []).length === (original.projectIds.length + original.locationIds.length));

    // ================================================== F. live: assignment (0007)
    const { data: pool } = await sup.c.from("leads").select("id, project_id, is_live, assigned_at, sla_due_at").is("assigned_to", null).eq("is_live", true).limit(1);
    const target = pool?.[0];
    if (!target) {
      skip("assignment (live)", "no unassigned live lead in the seed");
    } else {
      try {
        const denyCaller = await bulkAssignCore(sup.c, { id: c1.id, role: "caller" }, { leadIds: [target.id], toUserId: mw.id });
        check("assign: a caller cannot assign", !denyCaller.ok);
        const denyDb = await bulkAssignCore(c1.c, adminActor, { leadIds: [target.id], toUserId: mw.id });
        const denyMgr = await bulkAssignCore(mw.c, adminActor, { leadIds: [target.id], toUserId: mw.id });
        const { data: untouched } = await sup.c.from("leads").select("assigned_to").eq("id", target.id).single();
        check("assign: the DATABASE refuses a caller or manager even with a forged admin actor", !denyDb.ok && !denyMgr.ok && untouched?.assigned_to === null, `${denyDb.ok ? "caller OK?!" : denyDb.error} | ${denyMgr.ok ? "manager OK?!" : denyMgr.error}`);
        const toAdmin = await bulkAssignCore(adm.c, adminActor, { leadIds: [target.id], toUserId: adm.id });
        check("assign: a lead cannot be given to an admin (only manager, sub_manager, caller)", !toAdmin.ok);

        const before = await dbNow(URL, KEY); // the database's clock, not this machine's
        const done = await bulkAssignCore(adm.c, adminActor, { leadIds: [target.id], toUserId: mw.id });
        const { data: row } = await sup.c.from("leads").select("assigned_to, assigned_at, sla_due_at, first_touch_at").eq("id", target.id).single();
        check("assign: an admin assigns an unassigned lead to a manager", done.ok && done.data.moved === 1 && row?.assigned_to === mw.id, done.ok ? "" : done.error);
        check("assign: a live lead's 45-minute clock starts, and first_touch is NOT set", !!row?.sla_due_at && new Date(row.sla_due_at) > before && row?.first_touch_at === null, row?.sla_due_at ?? "no sla");
        const { data: hist } = await sup.c.from("assignments").select("reason, from_user_id, to_user_id, created_by").eq("lead_id", target.id).order("created_at", { ascending: false }).limit(1);
        check("assign: the ownership history records reason manual, who did it, from nobody to the manager", hist?.[0]?.reason === "manual" && hist[0].created_by === adm.id && hist[0].from_user_id === null && hist[0].to_user_id === mw.id);
        const { data: notif } = await mw.c.from("notifications").select("type, lead_id").eq("lead_id", target.id).eq("type", "assignment");
        check("assign: the new owner is notified", (notif ?? []).length >= 1);
        const { data: acts } = await sup.c.from("lead_activities").select("id").eq("lead_id", target.id);
        check("assign: no activity row was written (it would falsely stop the SLA clock)", (acts ?? []).length === 0);

        const twice = await bulkAssignCore(adm.c, adminActor, { leadIds: [target.id, target.id], toUserId: mw.id });
        check("assign: giving a lead to its current owner is a harmless no-op (duplicates collapsed)", twice.ok && twice.data.moved === 0 && twice.data.skipped === 1, twice.ok ? JSON.stringify(twice.data) : twice.error);
        const single = await reassignCore(adm.c, adminActor, { leadId: target.id, toUserId: mw.id });
        check("reassign: to the current owner gives a plain message", !single.ok && /already belongs/.test(single.error));
        const moved = await reassignCore(adm.c, adminActor, { leadId: target.id, toUserId: sub.id });
        const { data: row2 } = await sup.c.from("leads").select("assigned_to").eq("id", target.id).single();
        check("reassign: moves it on, recording mgr.worli -> sub.worli", moved.ok && row2?.assigned_to === sub.id);
        const badInput = await bulkAssignCore(adm.c, adminActor, { leadIds: [], toUserId: mw.id });
        check("assign: an empty selection is refused before the database", !badInput.ok);
      } finally {
        await sup.c.from("leads").update({ assigned_to: null, assigned_at: target.assigned_at, sla_due_at: target.sla_due_at }).eq("id", target.id);
      }
    }

    // ================================================== G. live: exit transfer plan on real users
    const { data: c3Open } = await sup.c.from("leads").select("id").eq("assigned_to", c3.id).not("pipeline_stage", "in", "(booked,dropped)");
    if ((c3Open ?? []).length > 0) {
      const plan = await planExitTransfer(sup.c, c3.id);
      check("exit transfer (live): Pune's caller's open leads all go to the Pune manager, who holds their location", plan.ok && plan.data.moves.length === c3Open!.length && plan.data.receivers.length === 1 && plan.data.receivers[0].userId === mp.id && !plan.data.receivers[0].fallback, plan.ok ? plan.data.receivers.map((r) => `${r.fullName} x${r.count}`).join(", ") : plan.error);
      const named = await planExitTransfer(sup.c, c3.id, c2.id);
      check("exit transfer (live): a named person overrides the rule", named.ok && named.data.override?.userId === c2.id && named.data.moves.every((m) => m.toUserId === c2.id));
      const toSelf = await planExitTransfer(sup.c, c3.id, c3.id);
      check("exit transfer (live): cannot name the person who is leaving", !toSelf.ok);
    }

    // fallback, live: park one lead from an UNMANAGED project on caller2 and see where it would go
    const { data: orphan } = await sup.c.from("leads").select("id, assigned_to, assigned_at").eq("project_id", PROJ.runwal).is("assigned_to", null).not("pipeline_stage", "in", "(booked,dropped)").limit(1);
    if (orphan?.[0]) {
      try {
        await sup.c.from("leads").update({ assigned_to: c2.id }).eq("id", orphan[0].id);
        const plan = await planExitTransfer(sup.c, c2.id);
        const mine = plan.ok ? plan.data.moves.find((m) => m.leadId === orphan[0].id) : undefined;
        check("exit transfer (live): a lead in a project no manager covers goes to the leaver's nearest MANAGER above (not their sub_manager)", mine?.toUserId === mw.id, plan.ok ? "" : plan.error);
        check("exit transfer (live): and it is reported as a fallback", plan.ok && plan.data.receivers.find((r) => r.userId === mw.id)?.fallback !== undefined);
      } finally {
        await sup.c.from("leads").update({ assigned_to: null, assigned_at: orphan[0].assigned_at }).eq("id", orphan[0].id);
      }
    } else {
      skip("exit transfer (live): fallback", "no unassigned open lead in an unmanaged project");
    }
  }

  console.log("");
  if (failed) {
    console.error(`${failed} check(s) failed${skipped ? `, ${skipped} skipped` : ""}.`);
    process.exit(1);
  }
  console.log(`All territory checks passed${skipped ? ` (${skipped} skipped — see SKIP lines above)` : ""}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
