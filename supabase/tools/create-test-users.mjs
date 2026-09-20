// create-test-users.mjs — one-off dev tool. Creates the eight mock auth users (runbook step 8).
//
// This is the ONLY kind of place the service_role key may be used: a local script run by Adish,
// outside src/, never deployed, never committed. The key is read from an environment variable
// you pass on the command line — it is not stored in .env.local or anywhere in the repo.
//
//   bash / Git Bash:
//     SUPABASE_SERVICE_ROLE_KEY=<key> node supabase/tools/create-test-users.mjs
//   PowerShell:
//     $env:SUPABASE_SERVICE_ROLE_KEY="<key>"; node supabase/tools/create-test-users.mjs; Remove-Item Env:SUPABASE_SERVICE_ROLE_KEY
//
// Safe to re-run: users that already exist are skipped. It refuses to create anything
// that is not an @parmar.test address, and it only ever touches auth users, never data.

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const EMAILS = [
  'super@parmar.test',
  'admin1@parmar.test',
  'mgr.worli@parmar.test',
  'mgr.pune@parmar.test',
  'sub.worli@parmar.test',
  'caller1@parmar.test',
  'caller2@parmar.test',
  'caller3@parmar.test',
];
const PASSWORD = 'Test@12345';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
);

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url) { console.error('NEXT_PUBLIC_SUPABASE_URL missing from .env.local'); process.exit(1); }
if (!key) { console.error('Set SUPABASE_SERVICE_ROLE_KEY on the command line (see the header of this file).'); process.exit(1); }
if (!EMAILS.every((e) => e.endsWith('@parmar.test'))) { console.error('Refusing: non-test email in list.'); process.exit(1); }

const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

let created = 0, skipped = 0, failed = 0;
for (const email of EMAILS) {
  const { error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (!error) { console.log(`created  ${email}`); created++; }
  else if (/already|registered|exists/i.test(error.message)) { console.log(`exists   ${email}`); skipped++; }
  else { console.error(`FAILED   ${email} — ${error.message}`); failed++; }
}

console.log(`\n${created} created, ${skipped} already existed, ${failed} failed.`);
if (failed) process.exit(1);
console.log('Next: run supabase/seed.sql in the SQL editor.');
