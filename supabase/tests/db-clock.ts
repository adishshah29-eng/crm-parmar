// The DATABASE's clock, for tests.
//
// "Today", "this week" and "working hours" are decided by the database (now() inside SQL functions
// and cron jobs). A test that works them out from THIS machine's clock is only right while the two
// clocks agree, and a developer laptop can easily be hours off (this one was 8 hours behind, on a
// different IST calendar day). So tests ask the server what time it is: every response from the
// Supabase REST endpoint carries a Date header from the server's own clock.

export async function dbNow(url: string, anonKey: string): Promise<Date> {
  try {
    const res = await fetch(`${url}/rest/v1/`, { headers: { apikey: anonKey } });
    const header = res.headers.get("date");
    const server = header ? new Date(header) : null;
    if (server && !Number.isNaN(server.getTime())) return server;
  } catch {
    /* fall through to the local clock */
  }
  return new Date();
}
