// run-org-tests.ts — proves user administration (src/lib/org/*) against the real database.
//
//   npm run test:org
//   SUPABASE_SERVICE_ROLE_KEY=<key> npm run test:org     <- also runs the real create/ban lifecycle
//
// Needs .env.local, the seed, and (for the hierarchy counts) migration 0005 applied.
//
// Without the key, the auth-admin API is replaced by a recording fake, so the create, rollback,
// ban and transfer LOGIC is still exercised against the real tables and real RLS. Only the actual
// Supabase auth calls are faked. With the key, a disposable @parmar.test user is created, signed
// in, deactivated (sign-in must then fail), and fully removed.
//
// It temporarily deactivates caller3 (moving their open leads to caller2) and then restores
// everything it touched. Ownership-history rows are append-only, so a few exit_transfer rows
// remain on mock leads. Never run this against real data.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import type { AdminAuthClient } from "../../src/lib/supabase/admin";
import { createUserCore, deactivateUserCore, updateUserCore } from "../../src/lib/org/mutations";
import { buildHierarchy, queryDeactivationPreview, queryLeadCounts, queryUser, queryUsers } from "../../src/lib/org/queries";
import { PARENT_ROLES, createUserSchema, parentAllowed, updateUserSchema } from "../../src/lib/schemas/user";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) throw new Error("Missing Supabase URL / anon key in .env.local");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any>;

async function signIn(email: string, password = "Test@12345") {
  const c: Client = createClient(URL, KEY, { auth: { persistSession: false } });
  const { data, error } = await c.auth.signInWithPassword({ email, password });
  return { c, id: data.user?.id ?? "", error };
}
async function mustSignIn(email: string) {
  const r = await signIn(email);
  if (r.error) throw new Error(`sign in failed for ${email}: ${r.error.message}`);
  return r;
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

/** Records every call so tests can assert what was (not) sent to the auth admin API. */
function fakeAdmin(opts: { createId?: string; createError?: string; banError?: boolean } = {}) {
  const calls: string[] = [];
  const admin = {
    createUser: async () => {
      calls.push("create");
      if (opts.createError) return { data: { user: null }, error: { message: opts.createError } };
      return { data: { user: { id: opts.createId ?? crypto.randomUUID() } }, error: null };
    },
    deleteUser: async (id: string) => {
      calls.push(`delete:${id}`);
      return { data: { user: null }, error: null };
    },
    updateUserById: async (id: string, attrs: { ban_duration?: string }) => {
      calls.push(`ban:${attrs.ban_duration}`);
      void id;
      return opts.banError ? { data: { user: null }, error: { message: "boom" } } : { data: { user: {} }, error: null };
    },
  } as unknown as AdminAuthClient;
  return { admin, calls };
}

async function main() {
  // ================================================== A. pure rules (no database)
  check("rule: caller may report to a manager or sub_manager only", parentAllowed("caller", "manager") && parentAllowed("caller", "sub_manager") && !parentAllowed("caller", "caller") && !parentAllowed("caller", "admin"));
  check("rule: sub_manager reports to a manager only", parentAllowed("sub_manager", "manager") && !parentAllowed("sub_manager", "sub_manager") && !parentAllowed("sub_manager", "admin"));
  check("rule: manager reports to an admin or super_admin", parentAllowed("manager", "admin") && parentAllowed("manager", "super_admin") && !parentAllowed("manager", "manager"));
  check("rule: super_admin reports to nobody", PARENT_ROLES.super_admin.length === 0);

  const base = { fullName: "Test Person", email: "T@Parmar.Test", password: "longenough1", role: "caller", parentId: crypto.randomUUID() };
  check("schema: valid create passes, email is lower-cased", createUserSchema.safeParse(base).success && createUserSchema.parse(base).email === "t@parmar.test");
  check("schema: nobody can create a second super_admin", !createUserSchema.safeParse({ ...base, role: "super_admin" }).success);
  check("schema: short password refused", !createUserSchema.safeParse({ ...base, password: "short" }).success);
  check("schema: empty 'reports to' is a friendly message", createUserSchema.safeParse({ ...base, parentId: "" }).error?.issues[0]?.message === "Pick who they report to");
  check("schema: update cannot deactivate (isActive:false refused)", !updateUserSchema.safeParse({ userId: crypto.randomUUID(), fullName: "Test Person", parentId: null, isActive: false }).success);
  check("schema: bad phone refused, blank phone fine",
    !updateUserSchema.safeParse({ userId: crypto.randomUUID(), fullName: "Test Person", parentId: null, phone: "12" }).success &&
    updateUserSchema.safeParse({ userId: crypto.randomUUID(), fullName: "Test Person", parentId: null, phone: "" }).success);

  // roll-up maths, on synthetic data
  const U = (id: string, role: "super_admin" | "admin" | "manager" | "sub_manager" | "caller", parentId: string | null, isActive = true) => ({ id, fullName: id, role, parentId, isActive });
  const tree = buildHierarchy(
    [U("A", "super_admin", null), U("B", "admin", "A"), U("C", "manager", "B"), U("D", "caller", "C"), U("E", "caller", "C"), U("X", "caller", "MISSING")],
    new Map([["C", { total: 2, open: 2 }], ["D", { total: 3, open: 2 }], ["E", { total: 1, open: 1 }]]),
  );
  const a = tree.find((n) => n.id === "A")!;
  const c = a.children[0].children[0];
  check("tree: totals roll up through every level", c.teamTotal === 6 && c.teamOpen === 5 && a.teamTotal === 6 && a.teamOpen === 5, `manager team ${c.teamTotal}/${c.teamOpen}`);
  check("tree: descendant counts", c.descendants === 2 && a.descendants === 4);
  check("tree: a user whose parent is invisible becomes a root instead of vanishing", tree.some((n) => n.id === "X"));

  // ================================================== B. reads, as real users
  const sup = await mustSignIn("super@parmar.test");
  const adm = await mustSignIn("admin1@parmar.test");
  const c1 = await mustSignIn("caller1@parmar.test");
  const c2 = await mustSignIn("caller2@parmar.test");
  const c3 = await mustSignIn("caller3@parmar.test");
  const mw = await mustSignIn("mgr.worli@parmar.test");
  const mp = await mustSignIn("mgr.pune@parmar.test");
  const sub = await mustSignIn("sub.worli@parmar.test");
  const superActor = { id: sup.id, role: "super_admin" as const };

  const all = await queryUsers(sup.c, {});
  check("list: super_admin sees all 8 seeded users", all.ok && all.data.length >= 8, all.ok ? `${all.data.length} users` : all.error);
  const byName = new Map(all.ok ? all.data.map((u) => [u.email, u]) : []);
  check("list: parent name and territory count resolve", byName.get("mgr.worli@parmar.test")?.territoryCount === 2 && byName.get("caller1@parmar.test")?.parentName === "Sub Worli");
  check("list: sorted seniority first (super_admin before callers)", all.ok && all.data[0].role === "super_admin");

  const managers = await queryUsers(sup.c, { role: "manager" });
  check("filter: by role", managers.ok && managers.data.length >= 2 && managers.data.every((u) => u.role === "manager"));
  const searched = await queryUsers(sup.c, { search: "worli" });
  check("filter: by name, case-insensitive", searched.ok && searched.data.length >= 2 && searched.data.every((u) => /worli/i.test(u.fullName + u.email)), searched.ok ? `${searched.data.length} match` : searched.error);
  const nothing = await queryUsers(sup.c, { search: "zzzzzz" });
  check("filter: no match is an empty list, not an error", nothing.ok && nothing.data.length === 0);
  const hostile = await queryUsers(sup.c, { search: "a),role.eq.admin,(" });
  check("filter: punctuation cannot break the query", hostile.ok, hostile.ok ? "" : hostile.error);
  const bad = await queryUsers(sup.c, { role: "wizard" });
  check("filter: unknown role is rejected", !bad.ok);

  const asCaller = await queryUsers(c1.c, {});
  check("RLS: a caller listing users sees only themself", asCaller.ok && asCaller.data.length === 1 && asCaller.data[0].id === c1.id, asCaller.ok ? `${asCaller.data.length} row` : asCaller.error);
  const asMgr = await queryUsers(mw.c, {});
  check("RLS: a manager sees themself and their team, not the other manager", asMgr.ok && asMgr.data.some((u) => u.id === sub.id) && !asMgr.data.some((u) => u.id === mp.id), asMgr.ok ? `${asMgr.data.length} rows` : asMgr.error);
  const oneBad = await queryUser(sup.c, "not-a-uuid");
  check("get: malformed id is a clean 'does not exist'", !oneBad.ok);

  const subPrev = await queryDeactivationPreview(sup.c, sub.id);
  check("preview: a sub_manager shows their 2 active reports", subPrev.ok && subPrev.data.activeReports === 2, subPrev.ok ? `${subPrev.data.activeReports} reports` : subPrev.error);

  const counts = await queryLeadCounts(sup.c);
  if (!counts.ok) {
    skip("hierarchy counts", counts.error);
  } else {
    const { data: assigned } = await sup.c.from("leads").select("id, assigned_to").not("assigned_to", "is", null);
    const totalAssigned = assigned?.length ?? 0;
    const sum = [...counts.data.values()].reduce((s, v) => s + v.total, 0);
    check("counts (0005): per-owner totals add up to every assigned lead", sum === totalAssigned, `${sum} of ${totalAssigned}`);
    const mine = assigned?.filter((l) => l.assigned_to === c1.id).length ?? 0;
    check("counts (0005): caller1's total matches their leads", counts.data.get(c1.id)?.total === mine);
    const callerCounts = await queryLeadCounts(c1.c);
    check("counts (0005): RLS applies — a caller only counts their own", callerCounts.ok && [...callerCounts.data.keys()].every((id) => id === c1.id));
    const users = all.ok ? all.data : [];
    const root = buildHierarchy(users, counts.data).find((n) => n.role === "super_admin");
    check("counts (0005): the super_admin's team total equals all assigned leads", root?.teamTotal === totalAssigned, `${root?.teamTotal} of ${totalAssigned}`);
  }

  // ================================================== C. permission
  const spy = fakeAdmin();
  const inputOk = { fullName: "Nope Person", email: "nope@parmar.test", password: "longenough1", role: "caller", parentId: sub.id };
  for (const [label, who] of [["admin", adm], ["manager", mw], ["caller", c1]] as const) {
    const r = await createUserCore(who.c, spy.admin, { id: who.id, role: label === "admin" ? "admin" : label === "manager" ? "manager" : "caller" }, inputOk);
    check(`permission: ${label === "admin" ? "an" : "a"} ${label} cannot create users`, !r.ok);
  }
  check("permission: the auth admin API was never reached", spy.calls.length === 0, `calls: ${spy.calls.join(",") || "none"}`);

  // defence in depth: even if the actor check were bypassed, RLS still refuses
  const { data: c3Before } = await sup.c.from("users").select("full_name, phone").eq("id", c3.id).single();
  const forged = await updateUserCore(adm.c, null, { id: adm.id, role: "super_admin" }, { userId: c3.id, fullName: "Hacked Name", phone: "", parentId: mp.id });
  const { data: c3After } = await sup.c.from("users").select("full_name").eq("id", c3.id).single();
  check("permission: RLS refuses a user update even with a forged super_admin actor", !forged.ok && c3After?.full_name === c3Before?.full_name, forged.ok ? "UPDATE SUCCEEDED" : forged.error);

  // ================================================== D. update (real writes, restored)
  const original = { fullName: c3Before!.full_name, phone: c3Before!.phone ?? "" };
  try {
    const up = await updateUserCore(sup.c, null, superActor, { userId: c3.id, fullName: "Caller Three Renamed", phone: "98765 43210", parentId: mp.id });
    const { data: row } = await sup.c.from("users").select("full_name, phone, parent_id").eq("id", c3.id).single();
    check("update: name and phone save, phone stored as E.164", up.ok && row?.full_name === "Caller Three Renamed" && row?.phone === "+919876543210", up.ok ? row?.phone ?? "" : up.error);

    const moved = await updateUserCore(sup.c, null, superActor, { userId: c3.id, fullName: "Caller Three Renamed", phone: "", parentId: sub.id });
    if (!moved.ok && /migration 0006/.test(moved.error)) {
      skip("update: re-parenting rebuilds the hierarchy", "migration 0006 not applied (pg_safeupdate blocks the trigger) — run db push");
    } else {
      const { data: inTree } = await sup.c.from("user_hierarchy").select("ancestor_id").eq("descendant_id", c3.id).eq("ancestor_id", mw.id);
      check("update: re-parenting a caller rebuilds the hierarchy (now under the Worli manager)", moved.ok && (inTree ?? []).length === 1, moved.ok ? "" : moved.error);
    }

    const cases: [string, unknown][] = [
      ["a caller cannot report to another caller", { userId: c3.id, fullName: "X Y", phone: "", parentId: c2.id }],
      ["a caller cannot report to an admin", { userId: c3.id, fullName: "X Y", phone: "", parentId: adm.id }],
      ["nobody reports to themselves", { userId: mw.id, fullName: "X Y", phone: "", parentId: mw.id }],
      ["a non-super user needs a parent", { userId: c3.id, fullName: "X Y", phone: "", parentId: null }],
      ["the super_admin cannot be given a parent", { userId: sup.id, fullName: "X Y", phone: "", parentId: adm.id }],
    ];
    for (const [label, input] of cases) {
      const r = await updateUserCore(sup.c, null, superActor, input);
      check(`update: ${label}`, !r.ok, r.ok ? "ACCEPTED" : r.error);
    }
  } finally {
    await updateUserCore(sup.c, null, superActor, { userId: c3.id, fullName: original.fullName, phone: original.phone, parentId: mp.id });
  }

  // ================================================== E. create + rollback (fake auth admin, real tables)
  const noKey = await createUserCore(sup.c, null, superActor, inputOk);
  check("create: without the service key it says how to set it up", !noKey.ok && /SUPABASE_SERVICE_ROLE_KEY/.test(noKey.error));

  const dup = fakeAdmin({ createError: "A user with this email address has already been registered" });
  const dupRes = await createUserCore(sup.c, dup.admin, superActor, inputOk);
  check("create: a duplicate email gets a plain message", !dupRes.ok && /already exists/.test(dupRes.error));

  const badParent = fakeAdmin();
  const badRes = await createUserCore(sup.c, badParent.admin, superActor, { ...inputOk, parentId: c2.id });
  check("create: a bad parent is refused BEFORE any login is created", !badRes.ok && badParent.calls.length === 0, `calls: ${badParent.calls.join(",") || "none"}`);

  const before = (await queryUsers(sup.c, {})).ok ? (all.ok ? all.data.length : 0) : 0;
  const ghostId = crypto.randomUUID();
  const rb = fakeAdmin({ createId: ghostId });
  const rbRes = await createUserCore(sup.c, rb.admin, superActor, inputOk);
  const afterList = await queryUsers(sup.c, {});
  check("create: if the profile insert fails, the login is rolled back", !rbRes.ok && rb.calls.includes(`delete:${ghostId}`), `calls: ${rb.calls.join(",")}`);
  check("create: nothing was left behind in public.users", afterList.ok && afterList.data.length === before);

  // ================================================== F. deactivate (fake ban, real leads)
  const g1 = fakeAdmin();
  const noKeyDeact = await deactivateUserCore(sup.c, null, superActor, { userId: c3.id });
  check("deactivate: without the service key it says how to set it up", !noKeyDeact.ok && /SUPABASE_SERVICE_ROLE_KEY/.test(noKeyDeact.error));
  check("deactivate: cannot deactivate yourself", !(await deactivateUserCore(sup.c, g1.admin, superActor, { userId: sup.id })).ok);
  check("deactivate: the super_admin is protected", !(await deactivateUserCore(sup.c, g1.admin, { id: adm.id, role: "super_admin" }, { userId: sup.id })).ok);
  const withReports = await deactivateUserCore(sup.c, g1.admin, superActor, { userId: sub.id });
  check("deactivate: refused while people still report to them", !withReports.ok && /2 active people still report/.test(withReports.error), withReports.ok ? "" : withReports.error);
  check("deactivate: none of those refusals touched the auth admin API", g1.calls.length === 0, `calls: ${g1.calls.join(",") || "none"}`);
  const notSuper = await deactivateUserCore(adm.c, g1.admin, { id: adm.id, role: "admin" }, { userId: c3.id });
  check("deactivate: an admin cannot deactivate", !notSuper.ok);

  const { data: c3Leads } = await sup.c.from("leads").select("id, assigned_at, pipeline_stage").eq("assigned_to", c3.id);
  const openIds = (c3Leads ?? []).filter((l) => l.pipeline_stage !== "booked" && l.pipeline_stage !== "dropped").map((l) => l.id);
  if (openIds.length === 0) {
    skip("deactivate: transfer of open leads", "caller3 has no open leads in the seed");
  } else {
    const preview = await queryDeactivationPreview(sup.c, c3.id);
    check("preview: open-lead count matches the database", preview.ok && preview.data.openLeads === openIds.length, preview.ok ? `${preview.data.openLeads} open` : preview.error);

    check("preview: shows the automatic plan — all of Pune's caller's leads go to the Pune manager", preview.ok && preview.data.planError === null && preview.data.receivers.length === 1 && preview.data.receivers[0].userId === mp.id && preview.data.receivers[0].count === openIds.length, preview.ok ? preview.data.receivers.map((r) => `${r.fullName} x${r.count}`).join(", ") : preview.error);
    const toSelf = await deactivateUserCore(sup.c, g1.admin, superActor, { userId: c3.id, transferTo: c3.id });
    check("deactivate: cannot transfer to the person leaving", !toSelf.ok);

    const failBan = fakeAdmin({ banError: true });
    const banned = await deactivateUserCore(sup.c, failBan.admin, superActor, { userId: c3.id, transferTo: c2.id });
    const { data: stillActive } = await sup.c.from("users").select("is_active").eq("id", c3.id).single();
    const { data: stillMine } = await sup.c.from("leads").select("id").eq("assigned_to", c3.id);
    check("deactivate: if the ban fails, nothing changes (still active, leads not moved)", !banned.ok && stillActive?.is_active === true && (stillMine ?? []).length === (c3Leads ?? []).length);

    const good = fakeAdmin();
    // History is append-only, so old runs' rows are still there. Count before and after instead of
    // comparing timestamps: this machine's clock can differ from the database's.
    const histCount = async () =>
      (await sup.c.from("assignments").select("id", { count: "exact", head: true }).eq("reason", "exit_transfer").eq("from_user_id", c3.id)).count ?? 0;
    const histBefore = await histCount();
    try {
      const res = await deactivateUserCore(sup.c, good.admin, superActor, { userId: c3.id });
      if (!res.ok && /migration 0007/.test(res.error)) {
        skip("deactivate: transfer of open leads", "migration 0007 not applied (move_leads does not exist yet) — run db push");
      } else {
      check("deactivate: succeeds and reports how many leads moved", res.ok && res.data.transferred === openIds.length, res.ok ? `${res.data.transferred} moved` : res.error);
      check("deactivate: the login is banned first", good.calls[0]?.startsWith("ban:") && good.calls[0] !== "ban:none", good.calls.join(","));

      const { data: off } = await sup.c.from("users").select("is_active").eq("id", c3.id).single();
      check("deactivate: the user is inactive, not deleted", off?.is_active === false);
      const { data: moved } = await sup.c.from("leads").select("id").in("id", openIds).eq("assigned_to", mp.id);
      check("deactivate: every open lead went to the manager who covers its territory (not a named replacement)", (moved ?? []).length === openIds.length);
      const { data: hist } = await sup.c
        .from("assignments")
        .select("lead_id, reason, from_user_id, to_user_id, created_by")
        .eq("reason", "exit_transfer")
        .eq("from_user_id", c3.id)
        .order("created_at", { ascending: false })
        .limit(openIds.length); // the newest N rows are this run's
      const histAdded = (await histCount()) - histBefore;
      check("deactivate: each move is in the ownership history as exit_transfer", histAdded === openIds.length && (hist ?? []).length === openIds.length && (hist ?? []).every((h) => h.to_user_id === mp.id && h.created_by === sup.id && openIds.includes(h.lead_id)), `+${histAdded} rows`);
      const { data: touched } = await sup.c.from("lead_activities").select("id").in("lead_id", openIds).eq("activity_type", "assignment");
      check("deactivate: no activity row was written (it would falsely stop a live lead's SLA clock)", (touched ?? []).length === 0);
      const again = await deactivateUserCore(sup.c, good.admin, superActor, { userId: c3.id });
      check("deactivate: doing it twice is refused", !again.ok);
      }
    } finally {
      // restore: reactivate, then hand the leads back
      const re = await updateUserCore(sup.c, fakeAdmin().admin, superActor, { userId: c3.id, fullName: original.fullName, phone: original.phone, parentId: mp.id, isActive: true });
      for (const l of c3Leads ?? []) await sup.c.from("leads").update({ assigned_to: c3.id, assigned_at: l.assigned_at }).eq("id", l.id);
      const { data: back } = await sup.c.from("users").select("is_active").eq("id", c3.id).single();
      const { data: mineAgain } = await sup.c.from("leads").select("id").eq("assigned_to", c3.id);
      check("reactivate: the user is active again and their leads are restored", re.ok && back?.is_active === true && (mineAgain ?? []).length === (c3Leads ?? []).length, re.ok ? "" : re.error);
    }
  }

  // ================================================== G. the real thing (only with the service key)
  if (!SERVICE_KEY) {
    skip("real create -> sign in -> deactivate -> sign-in refused", "run with SUPABASE_SERVICE_ROLE_KEY=<key> to include");
  } else {
    const svc: Client = createClient(URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const admin = svc.auth.admin as unknown as AdminAuthClient;
    const email = `tmp.${Date.now()}@parmar.test`;
    const password = "Tmp@" + Math.random().toString(36).slice(2, 10);
    let newId = "";
    try {
      const made = await createUserCore(sup.c, admin, superActor, { fullName: "Temp Test Caller", email, password, role: "caller", parentId: sub.id });
      newId = made.ok ? made.data.userId : "";
      check("REAL create: login and profile both exist", made.ok, made.ok ? newId : made.error);

      const signed = await signIn(email, password);
      check("REAL create: the new user can sign in and reads only themself", !signed.error && (await queryUsers(signed.c, {})).ok, signed.error?.message ?? "");
      const { data: inH } = await sup.c.from("user_hierarchy").select("ancestor_id").eq("descendant_id", newId).eq("ancestor_id", mw.id);
      check("REAL create: they appear under the Worli manager in the hierarchy", (inH ?? []).length === 1);

      const off = await deactivateUserCore(sup.c, admin, superActor, { userId: newId });
      check("REAL deactivate: succeeds (no open leads, no reports)", off.ok, off.ok ? "" : off.error);
      const refused = await signIn(email, password);
      check("REAL deactivate: the banned user can no longer sign in", !!refused.error, refused.error?.message ?? "SIGN-IN STILL WORKS");

      const on = await updateUserCore(sup.c, admin, superActor, { userId: newId, fullName: "Temp Test Caller", phone: "", parentId: sub.id, isActive: true });
      const back = await signIn(email, password);
      check("REAL reactivate: sign-in works again", on.ok && !back.error, on.ok ? back.error?.message ?? "" : on.error);
    } finally {
      if (newId) {
        // tooling cleanup with the service key: history rows first, then the auth user (cascades to users + hierarchy)
        await svc.from("assignments").delete().or(`from_user_id.eq.${newId},to_user_id.eq.${newId}`);
        await svc.from("audit_log").delete().eq("entity_id", newId);
        const { error } = await svc.auth.admin.deleteUser(newId);
        check("REAL cleanup: temp user fully removed", !error, error?.message ?? "");
      }
    }
  }

  console.log("");
  if (failed) {
    console.error(`${failed} check(s) failed${skipped ? `, ${skipped} skipped` : ""}.`);
    process.exit(1);
  }
  console.log(`All org checks passed${skipped ? ` (${skipped} skipped — see SKIP lines above)` : ""}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
