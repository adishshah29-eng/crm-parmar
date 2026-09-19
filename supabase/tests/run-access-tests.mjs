// run-access-tests.mjs — the Phase 0 gate.
//
// Signs in as real users through the anon key and queries the database the way an
// attacker would: directly, bypassing every line of React. If these pass, access
// control is real. If they fail, the app only *looks* secure.
//
//   npm run db:test        (or: node supabase/tests/run-access-tests.mjs)
//
// Needs .env.local (URL + anon key) and the seed loaded (seed.sql assigns leads to
// callers and gives mgr.pune one Raheja lead — the tests depend on that).
//
// Every test proves BOTH directions where it can: the right person CAN, the wrong
// person CANNOT. A test that only shows the allowed case is not a test.
//
// Tests 1-6 are the six acceptance tests in brain/04-access-control.md.
// Test 5's "export" half is enforced by the exportLeads server action, not the
// database, so the DB-level half here is "a manager cannot import (insert) leads".
// Re-test export by hand once exportLeads exists.

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
);

const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const PASSWORD = 'Test@12345';
const PUNE_PROJECT = '22222222-0000-0000-0000-000000000006'; // Supreme Rivana — Pune manager's territory
const RAHEJA = '22222222-0000-0000-0000-000000000001'; //      Worli manager's territory
const RLS_VIOLATION = '42501';

if (!URL || !KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local');
  process.exit(1);
}

async function signIn(email) {
  const c = createClient(URL, KEY, { auth: { persistSession: false } });
  const { data, error } = await c.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`sign in failed for ${email}: ${error.message} (are the 8 auth users created and seed.sql run?)`);
  return { c, id: data.user.id };
}

const results = [];
function check(name, passed, detail = '') {
  results.push({ name, passed });
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
}

async function main() {
  const sup = await signIn('super@parmar.test');
  const adm = await signIn('admin1@parmar.test');
  const c1 = await signIn('caller1@parmar.test');
  const c2 = await signIn('caller2@parmar.test');
  const mw = await signIn('mgr.worli@parmar.test');
  const mp = await signIn('mgr.pune@parmar.test');
  const sub = await signIn('sub.worli@parmar.test');

  // ground truth, read as super_admin
  const { data: all } = await sup.c
    .from('leads')
    .select('id, person_id, project_id, location_id, assigned_to, notes');
  if (!all?.length) {
    console.error('No leads visible to super_admin — seed data missing. Stopping.');
    process.exit(1);
  }
  const ownedBy = (uid) => all.filter((l) => l.assigned_to === uid);
  if (!ownedBy(c1.id).length || !ownedBy(c2.id).length || !ownedBy(mp.id).length) {
    console.error('Seed did not assign leads to caller1, caller2 and mgr.pune. Re-run the assignments block of seed.sql.');
    process.exit(1);
  }

  // ------------------------------------------------------------ 1. caller sees only own leads
  const { data: c1Leads } = await c1.c.from('leads').select('id, assigned_to');
  check(
    '1. caller sees only own leads',
    (c1Leads ?? []).length > 0 && c1Leads.every((l) => l.assigned_to === c1.id),
    `${c1Leads?.length ?? 0} rows, all own (and >0, so this is not vacuous)`
  );

  // ------------------------------------------------------------ 2. cannot fetch another caller's lead by id
  const othersLead = ownedBy(c2.id)[0];
  const { data: stolen, error: stolenErr } = await c1.c.from('leads').select('id').eq('id', othersLead.id);
  check("2. caller cannot fetch another caller's lead by id", !stolenErr && (stolen ?? []).length === 0, 'zero rows, no error');

  // ------------------------------------------------------------ 3. manager blind outside territory
  const { data: mwLeads } = await mw.c.from('leads').select('id, project_id, assigned_to');
  const puneVisible = (mwLeads ?? []).filter((l) => l.project_id === PUNE_PROJECT);
  const mwTerritory = new Set([RAHEJA, '22222222-0000-0000-0000-000000000002']);
  const teamIds = new Set([mw.id, sub.id, c1.id, c2.id]);
  const strays = (mwLeads ?? []).filter((l) => !mwTerritory.has(l.project_id) && !teamIds.has(l.assigned_to));
  check(
    '3. manager cannot see leads outside territory or team (Pune lead invisible)',
    (mwLeads ?? []).length > 0 && puneVisible.length === 0 && strays.length === 0,
    `${mwLeads?.length ?? 0} visible, ${puneVisible.length} Pune, ${strays.length} stray`
  );

  // ------------------------------------------------------------ 4. manager sees in-territory lead owned by another manager
  const managedByPune = ownedBy(mp.id)[0]; // a Raheja lead owned by mgr.pune
  const { data: seen } = await mw.c.from('leads').select('id').eq('id', managedByPune.id);
  check(
    '4. manager sees an in-territory lead owned by another manager',
    (seen ?? []).length === 1,
    'mgr.worli reads mgr.pune\'s Raheja lead through the shared project'
  );

  // ------------------------------------------------------------ 5. manager cannot import
  const { error: insErr } = await mw.c.from('leads').insert({
    person_id: all[0].person_id,
    project_id: all[0].project_id,
    location_id: all[0].location_id,
  });
  check(
    '5. manager cannot insert leads (import is admin-only; export is gated in exportLeads)',
    insErr?.code === RLS_VIOLATION,
    insErr ? `blocked (${insErr.code})` : 'INSERT SUCCEEDED — policy hole'
  );

  // ------------------------------------------------------------ 6. sub_manager inherits, sibling territory hidden
  const { data: subLeads } = await sub.c.from('leads').select('id, project_id');
  const inherits = (subLeads ?? []).some((l) => mwTerritory.has(l.project_id));
  const subSeesPune = (subLeads ?? []).some((l) => l.project_id === PUNE_PROJECT);
  check(
    '6. sub_manager sees parent territory and not a sibling manager\'s',
    inherits && !subSeesPune,
    `${subLeads?.length ?? 0} visible, inherits=${inherits}, pune=${subSeesPune}`
  );

  // ------------------------------------------------------------ extras
  // 7 — audit log. Make sure a row exists first, otherwise "sees nothing" proves nothing.
  await sup.c.from('audit_log').insert({ actor_id: sup.id, action: 'login', entity_type: 'user', entity_id: sup.id });
  const { data: auditAdmin } = await adm.c.from('audit_log').select('id').limit(1);
  const { data: auditCaller } = await c1.c.from('audit_log').select('id').limit(1);
  check(
    '7. audit log: admin can read, caller cannot',
    (auditAdmin ?? []).length === 1 && (auditCaller ?? []).length === 0
  );

  // 8 — users
  const { error: userErr } = await c1.c.from('users').insert({
    id: crypto.randomUUID(), full_name: 'Hacker', email: 'h@x.test', role: 'admin',
  });
  check('8. caller cannot create users', userErr?.code === RLS_VIOLATION, userErr?.code ?? 'INSERT SUCCEEDED');

  // 9 — a caller cannot give a lead away (needs migration 0004)
  const mine = ownedBy(c1.id)[0];
  const { error: giveErr } = await c1.c.from('leads').update({ assigned_to: c2.id }).eq('id', mine.id);
  const { data: afterGive } = await sup.c.from('leads').select('assigned_to').eq('id', mine.id).single();
  check(
    '9. caller cannot reassign their own lead (migration 0004)',
    !!giveErr && afterGive?.assigned_to === c1.id,
    giveErr ? `blocked (${giveErr.code})` : 'UPDATE SUCCEEDED — apply 0004_caller_column_guard.sql'
  );

  // 10 — positive control: a caller CAN edit their own lead's normal fields
  const original = mine.notes ?? null;
  const { data: edited, error: editErr } = await c1.c
    .from('leads').update({ notes: 'access-test' }).eq('id', mine.id).select('id');
  await sup.c.from('leads').update({ notes: original }).eq('id', mine.id); // restore
  check('10. caller CAN update notes on their own lead', !editErr && (edited ?? []).length === 1);

  // 11 — a caller cannot update someone else's lead (0 rows, not an error)
  const { data: hijack } = await c1.c.from('leads').update({ notes: 'hijack' }).eq('id', othersLead.id).select('id');
  const { data: hijackCheck } = await sup.c.from('leads').select('notes').eq('id', othersLead.id).single();
  check(
    "11. caller cannot update another caller's lead",
    (hijack ?? []).length === 0 && hijackCheck?.notes !== 'hijack'
  );

  // 12 — only super_admin can delete leads
  const { data: del } = await c1.c.from('leads').delete().eq('id', mine.id).select('id');
  const { data: stillThere } = await sup.c.from('leads').select('id').eq('id', mine.id);
  check('12. caller cannot delete a lead', (del ?? []).length === 0 && (stillThere ?? []).length === 1);

  // 13 — a caller cannot write to someone else's timeline
  const { error: actErr } = await c1.c.from('lead_activities').insert({
    lead_id: othersLead.id, user_id: c1.id, activity_type: 'remark', remark: 'should not land',
  });
  check("13. caller cannot add activity to another caller's lead", actErr?.code === RLS_VIOLATION, actErr?.code ?? 'INSERT SUCCEEDED');

  // 14 — admin reads everything super_admin does
  const { data: admLeads } = await adm.c.from('leads').select('id');
  check('14. admin sees all leads', (admLeads ?? []).length === all.length, `${admLeads?.length ?? 0} of ${all.length}`);

  console.log('');
  const failed = results.filter((r) => !r.passed);
  if (failed.length) {
    console.error(`${failed.length} of ${results.length} failed. Phase 0 is NOT complete.`);
    process.exit(1);
  }
  console.log(`All ${results.length} access tests passed. Phase 0 gate is open.`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
