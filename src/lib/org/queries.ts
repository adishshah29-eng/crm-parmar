import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { fail, ok, type ActionResult, type UserRole } from "@/types/action";
import { planExitTransfer } from "@/lib/org/transfer";
import { userListParamsSchema, type DeactivationPreview } from "@/lib/schemas/user";

// Read side of user administration. Pure functions over a session-bound client: RLS decides what
// each caller may read (super_admin and admin read every user; everyone else reads themselves and
// their descendants). No next/* imports, so supabase/tests can run these directly.

type Client = SupabaseClient<Database>;

const ROLE_RANK: Record<UserRole, number> = { super_admin: 0, admin: 1, manager: 2, sub_manager: 3, caller: 4 };
const TERMINAL_STAGES = "(booked,dropped)";

export type UserRow = {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  role: UserRole;
  parentId: string | null;
  parentName: string | null;
  isActive: boolean;
  territoryCount: number;
  createdAt: string;
};

type RawUser = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  role: UserRole;
  parent_id: string | null;
  is_active: boolean;
  created_at: string;
  parent: { full_name: string } | null;
  user_scopes: { count: number }[] | null;
};

const SELECT =
  "id, full_name, email, phone, role, parent_id, is_active, created_at, parent:parent_id(full_name), user_scopes(count)";

const mapUser = (r: RawUser): UserRow => ({
  id: r.id,
  fullName: r.full_name,
  email: r.email,
  phone: r.phone,
  role: r.role,
  parentId: r.parent_id,
  parentName: r.parent?.full_name ?? null,
  isActive: r.is_active,
  territoryCount: r.user_scopes?.[0]?.count ?? 0,
  createdAt: r.created_at,
});

/** Strip characters that would break PostgREST's or() syntax. */
const cleanSearch = (s: string) => s.replace(/[^\p{L}\p{N}\s.'@_-]/gu, "").trim();

export async function queryUsers(supabase: Client, rawParams: unknown): Promise<ActionResult<UserRow[]>> {
  const parsed = userListParamsSchema.safeParse(rawParams ?? {});
  if (!parsed.success) return fail("Those filters are not valid. Reset them and try again.");
  const { role, search } = parsed.data;

  let q = supabase.from("users").select(SELECT).limit(500);
  if (role) q = q.eq("role", role);
  const term = search ? cleanSearch(search) : "";
  if (term) q = q.or(`full_name.ilike.%${term}%,email.ilike.%${term}%`);

  const { data, error } = await q;
  if (error) {
    console.error("[org] list users failed:", error.code, error.message);
    return fail("Could not load users. Try again in a moment.");
  }
  const rows = (data as unknown as RawUser[]).map(mapUser);
  // Active first, then seniority, then name. Deactivated users stay visible, greyed, at the bottom.
  rows.sort(
    (a, b) =>
      Number(b.isActive) - Number(a.isActive) ||
      ROLE_RANK[a.role] - ROLE_RANK[b.role] ||
      a.fullName.localeCompare(b.fullName),
  );
  return ok(rows);
}

export async function queryUser(supabase: Client, userId: string): Promise<ActionResult<UserRow>> {
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return fail("That user does not exist.");
  const { data, error } = await supabase.from("users").select(SELECT).eq("id", userId).maybeSingle();
  if (error) {
    console.error("[org] get user failed:", error.code, error.message);
    return fail("Could not load this user. Try again in a moment.");
  }
  if (!data) return fail("That user does not exist.");
  return ok(mapUser(data as unknown as RawUser));
}

/** Everyone who could be picked as a parent or a transfer target. The form narrows by role rule. */
export async function queryActiveUsers(
  supabase: Client,
): Promise<ActionResult<{ id: string; fullName: string; role: UserRole }[]>> {
  const { data, error } = await supabase.from("users").select("id, full_name, role").eq("is_active", true).limit(500);
  if (error) {
    console.error("[org] active users failed:", error.code, error.message);
    return fail("Could not load users. Try again in a moment.");
  }
  const rows = data.map((u) => ({ id: u.id, fullName: u.full_name, role: u.role as UserRole }));
  rows.sort((a, b) => ROLE_RANK[a.role] - ROLE_RANK[b.role] || a.fullName.localeCompare(b.fullName));
  return ok(rows);
}

/** What deactivating this user would touch. Shown BEFORE confirming, as the task requires. */
export async function queryDeactivationPreview(
  supabase: Client,
  userId: string,
): Promise<ActionResult<DeactivationPreview>> {
  const [leads, reports] = await Promise.all([
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("assigned_to", userId)
      .not("pipeline_stage", "in", TERMINAL_STAGES),
    supabase.from("users").select("id", { count: "exact", head: true }).eq("parent_id", userId).eq("is_active", true),
  ]);
  if (leads.error || reports.error) return fail("Could not check this user's leads. Try again in a moment.");
  const openLeads = leads.count ?? 0;
  let receivers: DeactivationPreview["receivers"] = [];
  let planError: string | null = null;
  if (openLeads > 0) {
    const plan = await planExitTransfer(supabase, userId);
    if (plan.ok) receivers = plan.data.receivers;
    else planError = plan.error;
  }
  return ok({ openLeads, activeReports: reports.count ?? 0, receivers, planError });
}

// ---------------------------------------------------------------- hierarchy (A1.4)

export type OwnerCounts = Map<string, { total: number; open: number }>;

/** Per-owner lead counts, aggregated in SQL (migration 0005). RLS applies: the caller counts what they may read. */
export async function queryLeadCounts(supabase: Client): Promise<ActionResult<OwnerCounts>> {
  const { data, error } = await supabase.rpc("lead_counts_by_owner");
  if (error) {
    console.error("[org] lead counts failed:", error.code, error.message);
    return fail(
      error.code === "PGRST202"
        ? "Lead counts are not available yet: migration 0005 has not been applied."
        : "Could not load lead counts. Try again in a moment.",
    );
  }
  const map: OwnerCounts = new Map();
  for (const r of (data ?? []) as unknown as { owner_id: string; total: number; open: number }[]) {
    map.set(r.owner_id, { total: Number(r.total), open: Number(r.open) });
  }
  return ok(map);
}

export type HierarchyNode = {
  id: string;
  fullName: string;
  role: UserRole;
  isActive: boolean;
  /** Leads owned by this person. */
  ownTotal: number;
  ownOpen: number;
  /** Leads owned by this person and everyone below them. */
  teamTotal: number;
  teamOpen: number;
  /** Everyone below, at any depth. */
  descendants: number;
  children: HierarchyNode[];
};

/** Turns the flat user list into a tree with rolled-up counts. Pure, so it is unit-tested directly. */
export function buildHierarchy(
  users: Pick<UserRow, "id" | "fullName" | "role" | "parentId" | "isActive">[],
  counts: OwnerCounts,
): HierarchyNode[] {
  const nodes = new Map<string, HierarchyNode>();
  for (const u of users) {
    const own = counts.get(u.id) ?? { total: 0, open: 0 };
    nodes.set(u.id, {
      id: u.id,
      fullName: u.fullName,
      role: u.role,
      isActive: u.isActive,
      ownTotal: own.total,
      ownOpen: own.open,
      teamTotal: own.total,
      teamOpen: own.open,
      descendants: 0,
      children: [],
    });
  }

  const roots: HierarchyNode[] = [];
  for (const u of users) {
    const node = nodes.get(u.id)!;
    const parent = u.parentId ? nodes.get(u.parentId) : undefined;
    // A user whose parent this viewer cannot see becomes a root, so nobody silently disappears.
    if (parent && parent !== node) parent.children.push(node);
    else roots.push(node);
  }

  const order = (a: HierarchyNode, b: HierarchyNode) =>
    Number(b.isActive) - Number(a.isActive) || ROLE_RANK[a.role] - ROLE_RANK[b.role] || a.fullName.localeCompare(b.fullName);

  // Post-order roll-up. `seen` guards against a corrupt parent cycle looping forever.
  const seen = new Set<string>();
  const roll = (n: HierarchyNode) => {
    if (seen.has(n.id)) return;
    seen.add(n.id);
    n.children.sort(order);
    for (const c of n.children) {
      roll(c);
      n.teamTotal += c.teamTotal;
      n.teamOpen += c.teamOpen;
      n.descendants += 1 + c.descendants;
    }
  };
  roots.sort(order);
  roots.forEach(roll);
  return roots;
}
