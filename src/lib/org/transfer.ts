import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { fail, ok, type ActionResult, type UserRole } from "@/types/action";

// Exit transfer (task A2.4). When someone is deactivated, each of their OPEN leads goes to the
// person who now holds that lead's territory — never to a person the super admin names
// (05-lead-flow.md). Rule confirmed by Adish on 2026-09-20 (D-026):
//
//   1. the ACTIVE manager whose territory covers the lead's project or location
//   2. if several managers share it, spread the leads evenly across them
//   3. if no manager covers it, the leaving person's nearest manager above them
//      (or, for a manager with no manager above, their nearest active superior)
//
// Availability (on_site_visit / off) is deliberately ignored: this hands over ownership of a
// departing person's book, it is not routing of new leads.

type Client = SupabaseClient<Database>;

export type PlanLead = { id: string; projectId: string; locationId: string };
export type PlanManager = { userId: string; fullName: string; projectIds: Set<string>; locationIds: Set<string> };
export type PlanPerson = { userId: string; fullName: string; role: UserRole };

export type PlannedMove = { leadId: string; toUserId: string };
export type PlannedReceiver = {
  userId: string;
  fullName: string;
  count: number;
  /** true when they get leads only as the fallback, because no manager covers the territory. */
  fallback: boolean;
};
export type TransferPlan = { moves: PlannedMove[]; receivers: PlannedReceiver[] };

/**
 * Pure placement. Deterministic: leads are processed in id order and co-holders in id order,
 * so the same inputs always give the same plan (and the tests can assert it exactly).
 */
export function planMoves(input: { leads: PlanLead[]; managers: PlanManager[]; fallback: PlanPerson | null }): TransferPlan {
  const { managers, fallback } = input;
  const leads = [...input.leads].sort((a, b) => a.id.localeCompare(b.id));
  const turn = new Map<string, number>(); // per identical set of co-holders, whose turn is next
  const moves: PlannedMove[] = [];
  const tally = new Map<string, PlannedReceiver>();

  const credit = (p: { userId: string; fullName: string }, isFallback: boolean) => {
    const cur = tally.get(p.userId);
    if (cur) {
      cur.count += 1;
      cur.fallback = cur.fallback && isFallback;
    } else tally.set(p.userId, { userId: p.userId, fullName: p.fullName, count: 1, fallback: isFallback });
  };

  for (const lead of leads) {
    const holders = managers
      .filter((m) => m.projectIds.has(lead.projectId) || m.locationIds.has(lead.locationId))
      .sort((a, b) => a.userId.localeCompare(b.userId));

    if (holders.length > 0) {
      const key = holders.map((h) => h.userId).join("|");
      const i = turn.get(key) ?? 0;
      turn.set(key, i + 1);
      const to = holders[i % holders.length];
      moves.push({ leadId: lead.id, toUserId: to.userId });
      credit(to, false);
    } else if (fallback) {
      moves.push({ leadId: lead.id, toUserId: fallback.userId });
      credit(fallback, true);
    }
    // No holder and no fallback: the lead is left out. planExitTransfer reports this as an error.
  }

  const receivers = [...tally.values()].sort((a, b) => b.count - a.count || a.fullName.localeCompare(b.fullName));
  return { moves, receivers };
}

/** Nearest active manager above `userId`; failing that, the nearest active superior of any role. */
export function nearestSuperior(
  userId: string,
  users: { id: string; fullName: string; role: UserRole; isActive: boolean; parentId: string | null }[],
): PlanPerson | null {
  const byId = new Map(users.map((u) => [u.id, u]));
  const chain: typeof users = [];
  const seen = new Set<string>([userId]);
  let cur = byId.get(byId.get(userId)?.parentId ?? "");
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    if (cur.isActive) chain.push(cur);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  const pick = chain.find((u) => u.role === "manager") ?? chain[0];
  return pick ? { userId: pick.id, fullName: pick.fullName, role: pick.role } : null;
}

export type ExitPlan = TransferPlan & {
  openLeads: number;
  /** Set when the super admin chose one person for everything instead of the automatic rule. */
  override: { userId: string; fullName: string } | null;
};

/**
 * Reads the leaving user's open leads and works out where each goes. `overrideTo` reproduces the
 * old "send everything to this one person" behaviour, kept as an explicit opt-out.
 */
export async function planExitTransfer(
  supabase: Client,
  leavingUserId: string,
  overrideTo?: string,
): Promise<ActionResult<ExitPlan>> {
  const [leadsRes, managersRes, usersRes] = await Promise.all([
    supabase
      .from("leads")
      .select("id, project_id, location_id")
      .eq("assigned_to", leavingUserId)
      .not("pipeline_stage", "in", "(booked,dropped)")
      .limit(5000),
    supabase
      .from("users")
      .select("id, full_name, user_scopes(project_id, location_id)")
      .eq("role", "manager")
      .eq("is_active", true)
      .neq("id", leavingUserId),
    supabase.from("users").select("id, full_name, role, is_active, parent_id").limit(1000),
  ]);
  if (leadsRes.error || managersRes.error || usersRes.error) {
    console.error("[transfer] plan failed:", leadsRes.error?.code, managersRes.error?.code, usersRes.error?.code);
    return fail("Could not work out where the leads should go. Try again in a moment.");
  }

  const leads: PlanLead[] = leadsRes.data.map((l) => ({ id: l.id, projectId: l.project_id, locationId: l.location_id }));
  const users = usersRes.data.map((u) => ({
    id: u.id,
    fullName: u.full_name,
    role: u.role as UserRole,
    isActive: u.is_active,
    parentId: u.parent_id,
  }));

  if (overrideTo) {
    const to = users.find((u) => u.id === overrideTo);
    if (!to || !to.isActive) return fail("The person chosen to take the leads is not active.");
    if (to.id === leavingUserId) return fail("Open leads cannot be transferred to the person being deactivated.");
    return ok({
      openLeads: leads.length,
      moves: leads.map((l) => ({ leadId: l.id, toUserId: to.id })),
      receivers: leads.length ? [{ userId: to.id, fullName: to.fullName, count: leads.length, fallback: false }] : [],
      override: { userId: to.id, fullName: to.fullName },
    });
  }

  const managers: PlanManager[] = managersRes.data.map((m) => ({
    userId: m.id,
    fullName: m.full_name,
    projectIds: new Set(m.user_scopes.flatMap((s) => (s.project_id ? [s.project_id] : []))),
    locationIds: new Set(m.user_scopes.flatMap((s) => (s.location_id ? [s.location_id] : []))),
  }));
  const plan = planMoves({ leads, managers, fallback: nearestSuperior(leavingUserId, users) });

  if (plan.moves.length < leads.length) {
    return fail("No manager covers some of these leads and there is nobody above this person to take them. Choose a person to take them instead.");
  }
  return ok({ ...plan, openLeads: leads.length, override: null });
}
