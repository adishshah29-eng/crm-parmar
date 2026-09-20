// run-admin-tests.ts — Week 3: CSV import, CSV export, audit viewer, password reset (tasks A3.1-A3.4).
//
//   npm run test:admin
//   SUPABASE_SERVICE_ROLE_KEY=<key> npm run test:admin     <- also runs the real forced-password cycle
//
// Needs .env.local and the seed. The import checks need migration 0008 and are SKIPPED, not failed,
// until it is applied. It imports mock rows with phone numbers starting +919750 and deletes them
// again (with their leads, sources, history and notifications) when it finishes. Never run it
// against real data.

import Papa from "papaparse";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { safeCell, toCsv } from "../../src/lib/csv";
import { allowedWhileFlagged, mustResetPassword, safeNext } from "../../src/lib/auth-flags";
import { describeFilters, entityHref, queryAuditLog, queryRecentExports, summariseMeta } from "../../src/lib/audit-log/queries";
import { importBatchCore, queryImportErrors, queryImportSummary, startImportCore } from "../../src/lib/import/core";
import { cleanPhone, guessMapping, parseReceivedAt, toImportRow, toPayloadRow } from "../../src/lib/import/parse";
import { IMPORT_SERVER_BATCH_MAX } from "../../src/lib/import/schemas";
import { buildLeadsCsv, EXPORT_HEADER, exportLeadsWithAudit } from "../../src/lib/leads/export";
import { queryLeads } from "../../src/lib/leads/queries";
import { createUserCore, forcePasswordResetCore } from "../../src/lib/org/mutations";
import type { AdminAuthClient } from "../../src/lib/supabase/admin";
import { dbNow } from "./db-clock";

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
  return { c, id: data.user?.id ?? "", user: data.user, error };
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

function fakeAdmin() {
  const calls: { fn: string; args: unknown[] }[] = [];
  const admin = {
    createUser: async (...args: unknown[]) => (calls.push({ fn: "createUser", args }), { data: { user: { id: crypto.randomUUID() } }, error: null }),
    deleteUser: async (...args: unknown[]) => (calls.push({ fn: "deleteUser", args }), { data: { user: null }, error: null }),
    updateUserById: async (...args: unknown[]) => (calls.push({ fn: "updateUserById", args }), { data: { user: {} }, error: null }),
  } as unknown as AdminAuthClient;
  return { admin, calls };
}

const PROJ_RAHEJA = "Raheja Imperia Worli";
const PROJ_BELLEVUE = "Lodha Bellevue";
const TEST_PHONE = (i: number) => `+919750${String(i).padStart(6, "0")}`;

async function main() {
  // ================================================== A. csv safety (pure)
  check("csv: a formula is neutralised with a leading apostrophe", safeCell('=HYPERLINK("http://evil","x")') === `'=HYPERLINK("http://evil","x")`);
  check("csv: + - @ and tab starts are neutralised too", ["+cmd|x", "-1+2", "@SUM(A1)", "\tx"].every((v) => safeCell(v).startsWith("'")));
  check("csv: a real phone number keeps its + and is left alone", safeCell("+919876543210") === "+919876543210");
  check("csv: ordinary text is untouched", safeCell("Rohan Shah") === "Rohan Shah" && safeCell(null) === "" && safeCell(42) === "42");
  const tricky = toCsv([["a", 'he said "hi"', "x,y", "line1\nline2"]]);
  check("csv: quoting follows RFC 4180 and lines end in CRLF", tricky === 'a,"he said ""hi""","x,y","line1\nline2"\r\n');

  // ================================================== B. import parsing (pure)
  const phones: [string, string | null][] = [
    ["9876543210", "+919876543210"],
    ["+91 98765 43210", "+919876543210"],
    ["098765 43210", "+919876543210"],
    ["9.87654E+09", "+919876540000"],
    ["'9876543210", "+919876543210"],
    ["12345", null],
    ["", null],
    ["not a number", null],
  ];
  for (const [input, want] of phones) check(`phone: "${input}" -> ${want ?? "rejected"}`, cleanPhone(input) === want, String(cleanPhone(input)));

  const ist = (s: string) => {
    const d = parseReceivedAt(s);
    return d.ok ? d.iso : null;
  };
  check("date: 2026-09-19 (no time) is midnight IST", ist("2026-09-19") === "2026-09-18T18:30:00.000Z");
  check("date: 19/09/2026 15:45 is day-first, IST", ist("19/09/2026 15:45") === "2026-09-19T10:15:00.000Z");
  check("date: 03/04/2026 is 3 April, never 4 March", ist("03/04/2026")?.startsWith("2026-04-02T18:30") === true, String(ist("03/04/2026")));
  check("date: an explicit offset or Z is respected", ist("2026-09-19T10:00:00Z") === "2026-09-19T10:00:00.000Z" && ist("2026-09-19T15:30:00+05:30") === "2026-09-19T10:00:00.000Z");
  check("date: 31/02/2026 and 25:00 are rejected, not rolled over", ist("31/02/2026") === null && ist("2026-09-19 25:00") === null && ist("31-04-2026") === null);
  check("date: nonsense is rejected", ist("yesterday") === null && ist("") === null);

  const guessed = guessMapping(["Full Name", "Mobile No", "Email ID", "Project Name", "Created Time", "Campaign Name", "Notes"]);
  check("mapping: common portal headers are guessed", guessed.columns.phone === "Mobile No" && guessed.columns.name === "Full Name" && guessed.columns.email === "Email ID" && guessed.columns.project === "Project Name" && guessed.columns.receivedAt === "Created Time" && guessed.columns.campaign === "Campaign Name" && guessed.projectMode === "column");
  const noProject = guessMapping(["Name", "Phone"]);
  check("mapping: no project column falls back to 'one project for the file'", noProject.projectMode === "fixed" && noProject.columns.project === "");
  const both = guessMapping(["Phone", "Contact"]);
  check("mapping: one column is never used for two fields", new Set(Object.values(both.columns).filter(Boolean)).size === Object.values(both.columns).filter(Boolean).length);

  const map = { columns: { phone: "M", name: "N", email: "", project: "P", receivedAt: "D", campaign: "" }, projectMode: "column" as const, fixedProject: "" };
  const row = (o: Record<string, string>) => toPayloadRow(toImportRow(2, o, map));
  check("row: a good row is cleaned (E.164, trimmed)", row({ M: " 98765 43210 ", N: " Asha ", P: " Lodha Bellevue ", D: "" }).error === undefined && row({ M: "98765 43210", N: "Asha", P: "x", D: "" }).phone === "+919876543210");
  check("row: a bad phone is an error row with the value quoted", /Not a valid phone number: "12345"/.test(row({ M: "12345", N: "", P: "x", D: "" }).error ?? ""));
  check("row: a missing project is an error row", row({ M: "9876543210", N: "", P: "", D: "" }).error === "No project given");
  check("row: a bad date is an error row", /Date not understood/.test(row({ M: "9876543210", N: "", P: "x", D: "someday" }).error ?? ""));
  check("row: the original row is kept whole as the raw payload", row({ M: "9876543210", N: "A", P: "x", D: "", Extra: "keep me" }).raw.Extra === "keep me");
  const fixed = toImportRow(2, { M: "9876543210" }, { ...map, projectMode: "fixed", fixedProject: "  Sattva Parel " });
  check("row: 'one project for every row' uses the chosen project", fixed.project === "Sattva Parel");

  // ================================================== C. password flag and redirect safety (pure)
  check("flag: only an explicit true forces a change", mustResetPassword({ app_metadata: { must_reset_password: true } }) && !mustResetPassword({ app_metadata: { must_reset_password: false } }) && !mustResetPassword({ app_metadata: {} }) && !mustResetPassword(null) && !mustResetPassword({ app_metadata: { must_reset_password: "true" } }));
  check("flag: a flagged user can reach only the change page and the auth callback", allowedWhileFlagged("/set-password") && allowedWhileFlagged("/auth/confirm") && !allowedWhileFlagged("/dashboard") && !allowedWhileFlagged("/leads") && !allowedWhileFlagged("/users/x"));
  check("redirect: same-site paths pass", safeNext("/dashboard") === "/dashboard" && safeNext("/leads?x=1") === "/leads?x=1");
  check("redirect: open-redirect attempts fall back", ["https://evil.example", "//evil.example", "/\\evil.example", "javascript:alert(1)", "evil", "/x\r\nSet-Cookie: a=b"].every((n) => safeNext(n) === "/set-password"));
  check("redirect: a missing next falls back", safeNext(null) === "/set-password" && safeNext("") === "/set-password");

  // ================================================== D. audit presentation (pure)
  check("audit: filters are described in words", describeFilters({ callStatus: ["connected"], createdFrom: "2026-09-01", untouched: true }) === "status: connected · from: 2026-09-01 · untouched");
  check("audit: no filters is said plainly (a whole-database export)", describeFilters({}) === "no filters" && describeFilters(null) === "no filters" && describeFilters({ search: "", stage: [] }) === "no filters");
  check("audit: an export row summarises count and filters", summariseMeta("export", { rowCount: 1200, filters: { projectId: ["p1"] } }) === "1,200 leads · project: p1");
  check("audit: rows link to what they are about", entityHref("lead", "abc") === "/leads/abc" && entityHref("user", "u1") === "/users/u1" && entityHref("import", null) === "/import" && entityHref("project", "p") === "/territories/projects" && entityHref("mystery", "x") === null);

  // ================================================== E. live: export
  const sup = await mustSignIn("super@parmar.test");
  const adm = await mustSignIn("admin1@parmar.test");
  const mw = await mustSignIn("mgr.worli@parmar.test");
  const c1 = await mustSignIn("caller1@parmar.test");
  const sub = await mustSignIn("sub.worli@parmar.test");
  const superActor = { id: sup.id, role: "super_admin" as const };
  const adminActor = { id: adm.id, role: "admin" as const };

  const { count: allCount } = await sup.c.from("leads").select("id", { count: "exact", head: true });
  const all = await buildLeadsCsv(adm.c, adminActor, {});
  const parsedAll = all.ok ? Papa.parse<string[]>(all.data.csv.trim(), { skipEmptyLines: true }).data : [];
  check("export: an admin exports every lead", all.ok && all.data.rowCount === allCount && parsedAll.length === (allCount ?? 0) + 1, all.ok ? `${all.data.rowCount} of ${allCount}` : all.error);
  check("export: the header is exactly the documented columns", JSON.stringify(parsedAll[0]) === JSON.stringify([...EXPORT_HEADER]));
  const someRow = parsedAll[1] ?? [];
  check("export: a row carries name, E.164 phone, project and stage", !!someRow[0] && /^\+\d{8,15}$/.test(someRow[1]) && !!someRow[3] && !!someRow[8], someRow.slice(0, 4).join(" | "));

  const status = "connected";
  const filtered = await buildLeadsCsv(adm.c, adminActor, { callStatus: [status] });
  const listed = await queryLeads(adm.c, adm.id, { filters: { callStatus: [status] }, pageSize: 100 });
  check("export: it honours the current filters (same count as the table)", filtered.ok && listed.ok && filtered.data.rowCount === listed.data.total && listed.data.total > 0 && listed.data.total < (allCount ?? 0), filtered.ok && listed.ok ? `${filtered.data.rowCount} vs table ${listed.data.total}` : "");
  const notes = await buildLeadsCsv(adm.c, adminActor, { search: "zzzzzz" });
  check("export: no matches gives a header-only file, not an error", notes.ok && notes.data.rowCount === 0 && notes.data.csv.trim().split("\r\n").length === 1);
  const badFilters = await buildLeadsCsv(adm.c, adminActor, { callStatus: ["wizard"] });
  check("export: invalid filters are refused", !badFilters.ok);

  for (const [who, actor] of [["manager", { id: mw.id, role: "manager" as const }], ["sub_manager", { id: sub.id, role: "sub_manager" as const }], ["caller", { id: c1.id, role: "caller" as const }]] as const) {
    const r = await buildLeadsCsv(who === "manager" ? mw.c : who === "caller" ? c1.c : sub.c, actor, {});
    check(`export: a ${who} cannot export`, !r.ok && /Only admins/.test(r.error), r.ok ? "EXPORTED" : r.error);
  }

  // formula injection, end to end: a hostile name must not survive as a formula
  const { data: victim } = await sup.c.from("leads").select("id, person_id, persons(phone, full_name)").limit(1).single();
  const vPerson = victim!.person_id as string;
  const vPhone = (victim as unknown as { persons: { phone: string; full_name: string | null } }).persons.phone;
  const vName = (victim as unknown as { persons: { phone: string; full_name: string | null } }).persons.full_name;
  try {
    await sup.c.from("persons").update({ full_name: '=HYPERLINK("http://evil.example","click")' }).eq("id", vPerson);
    const inj = await buildLeadsCsv(adm.c, adminActor, { search: vPhone.slice(-8) });
    const cells = inj.ok ? Papa.parse<string[]>(inj.data.csv.trim(), { skipEmptyLines: true }).data[1] : [];
    check("export: a hostile name is written as text, not a formula", (cells?.[0] ?? "").startsWith("'="), cells?.[0]);
    check("export: the same row's phone number keeps its + untouched", cells?.[1] === vPhone, cells?.[1]);
  } finally {
    await sup.c.from("persons").update({ full_name: vName }).eq("id", vPerson);
  }

  // the audit row is the control
  const before = await queryRecentExports(adm.c, 1);
  const done = await exportLeadsWithAudit(adm.c, adminActor, { callStatus: [status] });
  const after = await queryRecentExports(adm.c, 3);
  const newest = after.ok ? after.data.rows[0] : undefined;
  check("export: an audited export returns the file and a file name", done.ok && /^parmar-leads-\d{4}-\d{2}-\d{2}\.csv$/.test(done.data.filename) && done.data.rowCount > 0, done.ok ? done.data.filename : done.error);
  check("audit: the export left a row with who, how many, and the filter", !!newest && newest.actorId === adm.id && done.ok && (newest.meta as { rowCount: number }).rowCount === done.data.rowCount && describeFilters((newest.meta as { filters: unknown }).filters) === `status: ${status}`, newest ? JSON.stringify(newest.meta) : "no row");
  check("audit: one export wrote exactly one more row", before.ok && after.ok && after.data.total === before.data.total + 1, before.ok && after.ok ? `${before.data.total} -> ${after.data.total}` : "");

  // an export must be IMPOSSIBLE without its audit row: make the audit write fail and watch it refuse
  const blockedAudit = new Proxy(adm.c, {
    get(target, prop, recv) {
      if (prop === "from") return (t: string) => (t === "audit_log" ? { insert: async () => ({ error: { code: "XX000", message: "audit unavailable" } }) } : target.from(t));
      return Reflect.get(target, prop, recv);
    },
  }) as Client;
  const blocked = await exportLeadsWithAudit(blockedAudit, adminActor, {});
  check("export: if the audit row cannot be written, NOTHING is returned", !blocked.ok && /blocked/.test(blocked.error) && !("data" in blocked), blocked.ok ? "DATA WAS RETURNED" : blocked.error);
  const denied = await exportLeadsWithAudit(mw.c, { id: mw.id, role: "manager" }, {});
  const afterDenied = await queryRecentExports(adm.c, 1);
  check("export: a refused export writes no audit row and returns nothing", !denied.ok && afterDenied.ok && after.ok && afterDenied.data.total === after.data.total);

  // ================================================== F. live: audit viewer
  const log = await queryAuditLog(adm.c, {});
  check("audit viewer: an admin reads the log, newest first", log.ok && log.data.total > 0 && log.data.rows.every((r, i, a) => i === 0 || a[i - 1].at >= r.at), log.ok ? `${log.data.total} entries` : log.error);
  const onlyExports = await queryAuditLog(adm.c, { action: "export" });
  check("audit viewer: filter by action", onlyExports.ok && onlyExports.data.total > 0 && onlyExports.data.rows.every((r) => r.action === "export"));
  const byActor = await queryAuditLog(adm.c, { actor: adm.id, action: "export" });
  check("audit viewer: filter by actor, with the actor's name resolved", byActor.ok && byActor.data.rows.length > 0 && byActor.data.rows.every((r) => r.actorId === adm.id && !!r.actorName));
  const NOW = await dbNow(URL, KEY); // the DATABASE's clock: this machine can be hours off
  const todayIst = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(NOW);
  const today = await queryAuditLog(adm.c, { from: todayIst, to: todayIst, action: "export" });
  const future = await queryAuditLog(adm.c, { from: "2099-01-01" });
  check("audit viewer: date range (IST days) includes today's export, excludes the future", today.ok && today.data.total > 0 && future.ok && future.data.total === 0);
  const p1 = await queryAuditLog(adm.c, { pageSize: 2, page: 1 });
  const p2 = await queryAuditLog(adm.c, { pageSize: 2, page: 2 });
  check("audit viewer: paging gives different rows", p1.ok && p2.ok && p1.data.rows.length === 2 && p2.data.rows.every((r) => !p1.data.rows.some((x) => x.id === r.id)));
  check("audit viewer: an unknown action is refused", !(await queryAuditLog(adm.c, { action: "wizardry" })).ok);
  const asCaller = await queryAuditLog(c1.c, {});
  const asMgr = await queryRecentExports(mw.c);
  check("audit viewer: RLS gives a caller and a manager an empty log", asCaller.ok && asCaller.data.total === 0 && asMgr.ok && asMgr.data.total === 0);
  const recent = await queryRecentExports(adm.c, 5);
  check("audit viewer: recent exports come newest first", recent.ok && recent.data.rows.length > 0 && recent.data.rows.every((r, i, a) => i === 0 || a[i - 1].at >= r.at));

  // ================================================== G. forced password change
  const spy = fakeAdmin();
  const target = (await sup.c.from("users").select("id").eq("email", "caller2@parmar.test").single()).data!.id as string;
  check("password: only the super admin can force a change", !(await forcePasswordResetCore(adm.c, spy.admin, adminActor, { userId: target })).ok && !(await forcePasswordResetCore(c1.c, spy.admin, { id: c1.id, role: "caller" }, { userId: target })).ok && spy.calls.length === 0);
  check("password: you cannot force your own (use Change password)", !(await forcePasswordResetCore(sup.c, spy.admin, superActor, { userId: sup.id })).ok);
  check("password: an unknown user is refused", !(await forcePasswordResetCore(sup.c, spy.admin, superActor, { userId: crypto.randomUUID() })).ok);
  check("password: a temporary password under 8 characters is refused", !(await forcePasswordResetCore(sup.c, spy.admin, superActor, { userId: target, temporaryPassword: "short" })).ok && spy.calls.length === 0);
  const noKey = await forcePasswordResetCore(sup.c, null, superActor, { userId: target });
  check("password: no service key -> plain message", !noKey.ok && /SUPABASE_SERVICE_ROLE_KEY/.test(noKey.error));

  const flagOnly = await forcePasswordResetCore(sup.c, spy.admin, superActor, { userId: target });
  const call1 = spy.calls.at(-1);
  check("password: 'require a change' sets the flag and leaves the password alone", flagOnly.ok && flagOnly.data.temporary === false && call1?.fn === "updateUserById" && JSON.stringify(call1.args[1]) === JSON.stringify({ app_metadata: { must_reset_password: true } }), JSON.stringify(call1?.args[1]));
  const withTemp = await forcePasswordResetCore(sup.c, spy.admin, superActor, { userId: target, temporaryPassword: "Temp-Pass-123" });
  const call2 = spy.calls.at(-1);
  check("password: a temporary password is set together with the flag", withTemp.ok && withTemp.data.temporary === true && (call2?.args[1] as { password?: string; app_metadata?: unknown }).password === "Temp-Pass-123" && !!(call2?.args[1] as { app_metadata?: unknown }).app_metadata);

  if (!SERVICE_KEY) {
    skip("REAL forced change: flag reaches the sign-in, temporary password works, old one stops", "run with SUPABASE_SERVICE_ROLE_KEY=<key> to include");
  } else {
    const svc: Client = createClient(URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const admin = svc.auth.admin as unknown as AdminAuthClient;
    const email = `tmp.pw.${Date.now()}@parmar.test`;
    const oldPw = "Old@" + Math.random().toString(36).slice(2, 10);
    const tempPw = "Tmp@" + Math.random().toString(36).slice(2, 10);
    let newId = "";
    try {
      const made = await createUserCore(sup.c, admin, superActor, { fullName: "Temp Pw Test", email, password: oldPw, role: "caller", parentId: sub.id });
      newId = made.ok ? made.data.userId : "";
      check("REAL: a temporary user was created for the test", made.ok, made.ok ? "" : made.error);
      const forced = await forcePasswordResetCore(sup.c, admin, superActor, { userId: newId, temporaryPassword: tempPw });
      check("REAL: the super admin forces a change with a temporary password", forced.ok, forced.ok ? "" : forced.error);
      const withOld = await signIn(email, oldPw);
      const withTemp2 = await signIn(email, tempPw);
      check("REAL: the old password stops working and the temporary one works", !!withOld.error && !withTemp2.error, withOld.error?.message ?? "old password still works");
      check("REAL: the signed-in user carries the flag the proxy checks", mustResetPassword(withTemp2.user), JSON.stringify(withTemp2.user?.app_metadata));
      await admin.updateUserById(newId, { app_metadata: { must_reset_password: false } });
      const cleared = await signIn(email, tempPw);
      check("REAL: clearing the flag releases them", !mustResetPassword(cleared.user));
    } finally {
      if (newId) {
        await svc.from("audit_log").delete().eq("entity_id", newId);
        const { error } = await svc.auth.admin.deleteUser(newId);
        check("REAL cleanup: the temporary user is removed", !error, error?.message ?? "");
      }
    }
  }

  // ================================================== H. live: the import (needs 0008)
  const probeImport = await startImportCore(adm.c, adminActor, { filename: "probe.csv", totalRows: 1, sourceCode: "walkin" });
  if (!probeImport.ok) throw new Error(`could not start the probe import: ${probeImport.error}`);
  const probe = await importBatchCore(adm.c, adminActor, { importId: probeImport.data.importId, sourceCode: "walkin", rows: [{ row: 2, phone: "12", project: "x", raw: {} }] });
  const has0008 = probe.ok || !/migration 0008/.test(probe.error);
  await sup.c.from("imports").delete().eq("id", probeImport.data.importId);

  if (!has0008) {
    skip("import: 1,200-row file, duplicates, error report, live routing, permission", "migration 0008 not applied — run `npx supabase db push`");
  } else {
    await runImportTests({ sup, adm, mw, c1, adminActor, now: NOW });
  }

  console.log("");
  if (failed) {
    console.error(`${failed} check(s) failed${skipped ? `, ${skipped} skipped` : ""}.`);
    process.exit(1);
  }
  console.log(`All Week 3 checks passed${skipped ? ` (${skipped} skipped — see SKIP lines above)` : ""}.`);
}

type Sess = Awaited<ReturnType<typeof mustSignIn>>;

async function runImportTests(s: { sup: Sess; adm: Sess; mw: Sess; c1: Sess; adminActor: { id: string; role: "admin" }; now: Date }) {
  const { sup, adm, mw, c1, adminActor, now } = s;
  const importIds: string[] = [];

  /** Runs a file through the same three steps the browser does: start, batches of 100, read the summary. */
  const runFile = async (filename: string, source: string, rows: Record<string, string>[], campaign?: string) => {
    const started = await startImportCore(adm.c, adminActor, { filename, totalRows: rows.length, sourceCode: source });
    if (!started.ok) throw new Error(started.error);
    importIds.push(started.data.importId);
    const map = { columns: { phone: "Mobile", name: "Name", email: "Email", project: "Project", receivedAt: "Date", campaign: "Campaign" }, projectMode: "column" as const, fixedProject: "" };
    for (let i = 0; i < rows.length; i += 100) {
      const res = await importBatchCore(adm.c, adminActor, {
        importId: started.data.importId,
        sourceCode: source,
        campaign,
        rows: rows.slice(i, i + 100).map((r, k) => toImportRow(i + k + 2, r, map)),
      });
      if (!res.ok) throw new Error(`batch at row ${i + 2} failed: ${res.error}`);
    }
    const summary = await queryImportSummary(adm.c, started.data.importId);
    if (!summary.ok) throw new Error(summary.error);
    return { id: started.data.importId, ...summary.data };
  };

  const good: Record<string, string>[] = [];
  for (let i = 0; i < 1100; i++) good.push({ Name: `Test Buyer ${i}`, Mobile: TEST_PHONE(i), Email: `t${i}@example.test`, Project: PROJ_RAHEJA, Date: "19/09/2026 11:00", Campaign: "import-test" });
  // 100 of the same people on a SECOND project: one person, two leads, possibly two owners
  for (let i = 0; i < 100; i++) good.push({ Name: `Test Buyer ${i}`, Mobile: TEST_PHONE(i), Email: "", Project: PROJ_BELLEVUE, Date: "", Campaign: "" });
  const bad: Record<string, string>[] = [
    { Name: "x", Mobile: "12345", Email: "", Project: PROJ_RAHEJA, Date: "", Campaign: "" },
    { Name: "x", Mobile: "", Email: "", Project: PROJ_RAHEJA, Date: "", Campaign: "" },
    { Name: "x", Mobile: "not a phone", Email: "", Project: PROJ_RAHEJA, Date: "", Campaign: "" },
    { Name: "x", Mobile: "98765", Email: "", Project: PROJ_RAHEJA, Date: "", Campaign: "" },
    { Name: "x", Mobile: "+1", Email: "", Project: PROJ_RAHEJA, Date: "", Campaign: "" },
    { Name: "x", Mobile: TEST_PHONE(5000), Email: "", Project: "Nonexistent Tower", Date: "", Campaign: "" },
    { Name: "x", Mobile: TEST_PHONE(5001), Email: "", Project: "Imaginary Heights", Date: "", Campaign: "" },
    { Name: "x", Mobile: TEST_PHONE(5002), Email: "", Project: "Nowhere", Date: "", Campaign: "" },
    { Name: "x", Mobile: TEST_PHONE(5003), Email: "", Project: "", Date: "", Campaign: "" },
    { Name: "x", Mobile: TEST_PHONE(5004), Email: "", Project: "   ", Date: "", Campaign: "" },
    { Name: "x", Mobile: TEST_PHONE(5005), Email: "", Project: PROJ_RAHEJA, Date: "31/02/2026", Campaign: "" },
  ];
  // scatter the bad rows through the file so a bad row in the middle of a batch is exercised
  const file = [...good];
  bad.forEach((b, i) => file.splice(50 + i * 97, 0, b));

  const cleanup = async () => {
    await sup.c.from("persons").delete().like("phone", "+919750%");
    for (const id of importIds) await sup.c.from("imports").delete().eq("id", id);
  };
  await cleanup(); // leftovers from an interrupted earlier run

  try {
    // ---- first import
    const t0 = Date.now();
    const first = await runFile("import-test.csv", "walkin", file);
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    check(`import: ${file.length} rows -> 1,200 new leads, 0 duplicates, ${bad.length} errors`, first.inserted === 1200 && first.duplicates === 0 && first.errors === bad.length, `${first.inserted} new, ${first.duplicates} dup, ${first.errors} errors in ${secs}s`);
    check("import: the imports row records the total", first.totalRows === file.length && first.uploadedBy === "Admin One");

    const { count: leadCount } = await sup.c.from("leads").select("id, persons!inner(phone)", { count: "exact", head: true }).like("persons.phone", "+919750%");
    const { count: personCount } = await sup.c.from("persons").select("id", { count: "exact", head: true }).like("phone", "+919750%");
    check("import: 1,200 leads for 1,100 people (100 people are on two projects)", leadCount === 1200 && personCount === 1100, `${leadCount} leads, ${personCount} people`);

    const errs = await queryImportErrors(adm.c, first.id);
    check("import: every bad row is in the error report with a reason and its original values", errs.ok && errs.data.length === bad.length && errs.data.every((e) => e.reason && e.raw && "Mobile" in e.raw), errs.ok ? `${errs.data.length} rows` : errs.error);
    const reasons = errs.ok ? errs.data.map((e) => e.reason).join(" | ") : "";
    check("import: reasons are plain — bad phone, unknown project, no project, bad date", /valid phone/.test(reasons) && /Unknown project "Nonexistent Tower"/.test(reasons) && /No project given/.test(reasons) && /Date not understood/.test(reasons), reasons.slice(0, 160));
    check("import: error rows carry the SPREADSHEET row number, in order", errs.ok && errs.data.every((e, i, a) => i === 0 || a[i - 1].row < e.row) && errs.data.every((e) => file[e.row - 2]?.Mobile === e.raw?.Mobile));

    const { data: sample } = await sup.c.from("leads").select("id, is_live, assigned_to, call_status, pipeline_stage, next_call_at, persons!inner(phone), projects!inner(name), lead_sources(campaign, received_at, raw_payload, sources(code))").eq("persons.phone", TEST_PHONE(7)).eq("projects.name", PROJ_RAHEJA).limit(2);
    const rahejaLead = (sample ?? []).find((l) => (l as unknown as { lead_sources: { campaign: string }[] }).lead_sources.some((x) => x.campaign === "import-test"));
    const src = (rahejaLead as unknown as { lead_sources: { campaign: string; received_at: string; raw_payload: Record<string, string>; sources: { code: string } }[] })?.lead_sources[0];
    check("import: a new walk-in lead is not live, unassigned, status new, stage enquiry", !!rahejaLead && rahejaLead.is_live === false && rahejaLead.assigned_to === null && rahejaLead.call_status === "new" && rahejaLead.pipeline_stage === "enquiry" && rahejaLead.next_call_at === null);
    check("import: its source row has the campaign, the received date (IST) and the whole raw row", src?.campaign === "import-test" && src.received_at.startsWith("2026-09-19T05:30") && src.raw_payload.Name === "Test Buyer 7" && src.sources.code === "walkin", JSON.stringify(src?.received_at));

    // ---- second import of the SAME file: the rule that prevents ownership fights
    const second = await runFile("import-test-again.csv", "walkin", file);
    check("re-import: 1,200 duplicates, ZERO new leads", second.inserted === 0 && second.duplicates === 1200 && second.errors === bad.length, `${second.inserted} new, ${second.duplicates} dup, ${second.errors} errors`);
    const { count: leadCount2 } = await sup.c.from("leads").select("id, persons!inner(phone)", { count: "exact", head: true }).like("persons.phone", "+919750%");
    check("re-import: the lead count did not move", leadCount2 === 1200);
    const { count: srcCount } = await sup.c.from("lead_sources").select("id, leads!inner(persons!inner(phone))", { count: "exact", head: true }).like("leads.persons.phone", "+919750%");
    check("re-import: every arrival was still recorded, 2 source rows per lead (nothing merged away)", srcCount === 2400, `${srcCount} source rows`);

    // ---- owner never changes on a duplicate
    const { data: victim } = await sup.c.from("leads").select("id, project_id, persons!inner(phone), projects!inner(name)").eq("persons.phone", TEST_PHONE(11)).eq("projects.name", PROJ_RAHEJA).single();
    await sup.c.from("leads").update({ assigned_to: c1.id }).eq("id", victim!.id);
    const viaReferral = await runFile("owner-check.csv", "referral", [{ Name: "Test Buyer 11", Mobile: TEST_PHONE(11), Email: "", Project: PROJ_RAHEJA, Date: "", Campaign: "friend" }]);
    const { data: still } = await sup.c.from("leads").select("assigned_to, lead_sources(id, sources(code))").eq("id", victim!.id).single();
    const codes = ((still as unknown as { lead_sources: { sources: { code: string } }[] }).lead_sources).map((x) => x.sources.code).sort();
    check("duplicate: the existing owner keeps the lead", viaReferral.duplicates === 1 && viaReferral.inserted === 0 && still?.assigned_to === c1.id);
    check("duplicate: the lead now lists all three arrivals, including the referral", codes.join() === "referral,walkin,walkin", codes.join());

    // ---- person details: only BLANK fields are filled, never overwritten
    const pid = (await sup.c.from("persons").select("id").eq("phone", TEST_PHONE(13)).single()).data!.id as string;
    await sup.c.from("persons").update({ full_name: null, email: null }).eq("id", pid);
    await runFile("fill-blanks.csv", "walkin", [{ Name: "Filled Name", Mobile: TEST_PHONE(13), Email: "filled@example.test", Project: PROJ_RAHEJA, Date: "", Campaign: "" }]);
    const filled = (await sup.c.from("persons").select("full_name, email").eq("id", pid).single()).data;
    await runFile("no-overwrite.csv", "walkin", [{ Name: "Somebody Else", Mobile: TEST_PHONE(13), Email: "other@example.test", Project: PROJ_RAHEJA, Date: "", Campaign: "" }]);
    const kept = (await sup.c.from("persons").select("full_name, email").eq("id", pid).single()).data;
    check("person: a blank name and email are filled from the file", filled?.full_name === "Filled Name" && filled?.email === "filled@example.test");
    check("person: existing details are never overwritten", kept?.full_name === "Filled Name" && kept?.email === "filled@example.test");

    // ---- the same buyer twice inside ONE file
    const dupFile = [0, 1, 2].map(() => ({ Name: "Twice", Mobile: TEST_PHONE(900001), Email: "", Project: PROJ_BELLEVUE, Date: "", Campaign: "" }));
    const inFile = await runFile("dup-in-file.csv", "walkin", dupFile);
    check("duplicate: the same buyer three times in one file = 1 lead, 2 duplicates", inFile.inserted === 1 && inFile.duplicates === 2, `${inFile.inserted} new, ${inFile.duplicates} dup`);

    // ---- live source
    const liveRows = [0, 1, 2, 3, 4].map((i) => ({ Name: `Live ${i}`, Mobile: TEST_PHONE(800000 + i), Email: "", Project: PROJ_RAHEJA, Date: "", Campaign: "meta-form" }));
    const live = await runFile("live-meta.csv", "meta", liveRows);
    const { data: liveLeads } = await sup.c.from("leads").select("is_live, assigned_to, assigned_at, sla_due_at, next_call_at, persons!inner(phone)").like("persons.phone", "+9197508000%");
    const istHour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false }).format(now).replace(":", ""));
    const inHours = istHour >= 1030 && istHour < 1930;
    check("live import: 5 new leads, all marked live", live.inserted === 5 && (liveLeads ?? []).length === 5 && (liveLeads ?? []).every((l) => l.is_live === true));
    if (inHours) {
      check("live import (working hours): each lead is either assigned with its 45-minute clock running, or waiting for a caller", (liveLeads ?? []).every((l) => (l.assigned_to && l.sla_due_at && l.assigned_at) || (!l.assigned_to && !l.sla_due_at)), `${(liveLeads ?? []).filter((l) => l.assigned_to).length} assigned`);
    } else {
      check("live import (outside working hours): NOT assigned, next_call_at = the next 10:30, no clock started", (liveLeads ?? []).every((l) => l.assigned_to === null && l.sla_due_at === null && !!l.next_call_at), `IST time ${istHour}`);
    }

    // ---- permission and validation
    const asCaller = await importBatchCore(sup.c, { id: c1.id, role: "caller" }, { importId: first.id, sourceCode: "walkin", rows: [{ row: 2, phone: TEST_PHONE(1), project: PROJ_RAHEJA, raw: {} }] });
    check("permission: a caller cannot import", !asCaller.ok && /Only admins/.test(asCaller.error));
    const forgedMgr = await importBatchCore(mw.c, adminActor, { importId: first.id, sourceCode: "walkin", rows: [{ row: 2, phone: TEST_PHONE(2), project: PROJ_RAHEJA, raw: {} }] });
    const forgedCaller = await importBatchCore(c1.c, adminActor, { importId: first.id, sourceCode: "walkin", rows: [{ row: 2, phone: TEST_PHONE(2), project: PROJ_RAHEJA, raw: {} }] });
    check("permission: the DATABASE refuses a manager or caller even with a forged admin actor", !forgedMgr.ok && !forgedCaller.ok, `${forgedMgr.ok ? "manager OK?!" : forgedMgr.error} | ${forgedCaller.ok ? "caller OK?!" : forgedCaller.error}`);
    const forgedStart = await startImportCore(mw.c, adminActor, { filename: "x.csv", totalRows: 1, sourceCode: "walkin" });
    check("permission: a manager cannot even start an import (imports table is admin-only)", !forgedStart.ok);
    check("validation: an unknown source is refused", !(await startImportCore(adm.c, adminActor, { filename: "x.csv", totalRows: 1, sourceCode: "nope" })).ok);
    check("validation: an empty or oversize file is refused", !(await startImportCore(adm.c, adminActor, { filename: "x.csv", totalRows: 0, sourceCode: "walkin" })).ok && !(await startImportCore(adm.c, adminActor, { filename: "x.csv", totalRows: 5001, sourceCode: "walkin" })).ok);
    const tooMany = await importBatchCore(adm.c, adminActor, { importId: first.id, sourceCode: "walkin", rows: Array.from({ length: IMPORT_SERVER_BATCH_MAX + 1 }, (_, i) => ({ row: i + 2, phone: TEST_PHONE(1), project: PROJ_RAHEJA, raw: {} })) });
    check(`validation: a batch over ${IMPORT_SERVER_BATCH_MAX} rows is refused`, !tooMany.ok);
    const ghost = await importBatchCore(adm.c, adminActor, { importId: crypto.randomUUID(), sourceCode: "walkin", rows: [{ row: 2, phone: TEST_PHONE(1), project: PROJ_RAHEJA, raw: {} }] });
    check("validation: a batch for an import that does not exist is refused", !ghost.ok);
  } finally {
    await cleanup();
    const { count: left } = await sup.c.from("persons").select("id", { count: "exact", head: true }).like("phone", "+919750%");
    const { count: leftImports } = await sup.c.from("imports").select("id", { count: "exact", head: true }).in("id", importIds);
    check("cleanup: every test person, lead, source, history row and import is gone", left === 0 && leftImports === 0, `${left} people, ${leftImports} imports left`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
