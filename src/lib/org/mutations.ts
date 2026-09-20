import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { fail, ok, type ActionResult, type UserRole } from "@/types/action";
import type { AdminAuthClient } from "@/lib/supabase/admin";
import { normalisePhone } from "@/lib/format";
import { planExitTransfer } from "@/lib/org/transfer";
import { callRpc } from "@/lib/supabase/rpc";
import { RESET_FLAG } from "@/lib/auth-flags";
import { forcePasswordResetSchema } from "@/lib/schemas/auth";
import {
  ROLE_LABEL,
  createUserSchema,
  deactivateUserSchema,
  parentAllowed,
  updateUserSchema,
} from "@/lib/schemas/user";

// Write side of user administration (tasks A1.2, A1.3).
//
// TWO clients, kept strictly apart:
//   supabase  session-bound, RLS applies. Every table read and write goes through it. The
//             policies (users_insert / users_update / leads_update ... = app.is_super()) are
//             the real permission check; the actor.role test below is only a better error message.
//   admin     service-role AUTH admin API. Used ONLY to create, delete, ban and unban login
//             accounts. It cannot touch tables and is never handed to a table query.

type Client = SupabaseClient<Database>;
export type Actor = { id: string; role: UserRole };

const ONLY_SUPER = "Only the super admin can manage users.";
const NO_ADMIN_API =
  "User management is not set up on this machine. Add SUPABASE_SERVICE_ROLE_KEY to .env.local (server-only) and restart.";
const BAN_FOREVER = "876000h"; // ~100 years; Supabase has no permanent flag
const CHUNK = 1000; // leads per move_leads call; the function caps one call at 2000

const chunk = <T>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

type ParentCheck = { ok: true } | { ok: false; error: string };

const roleWord = (r: UserRole) => {
  const w = ROLE_LABEL[r].toLowerCase();
  return `${/^[aeiou]/.test(w) ? "an" : "a"} ${w}`;
};

// SQLSTATE 21000 = pg_safeupdate rejecting the hierarchy rebuild; fixed by migration 0006.
const HIERARCHY_BLOCKED =
  "The org hierarchy could not be rebuilt: migration 0006 has not been applied to this database. Ask Adish to run db push.";

async function checkParent(supabase: Client, role: UserRole, parentId: string, selfId?: string): Promise<ParentCheck> {
  if (parentId === selfId) return { ok: false, error: "A person cannot report to themselves." };
  const { data: parent } = await supabase.from("users").select("id, role, is_active").eq("id", parentId).maybeSingle();
  if (!parent) return { ok: false, error: "That person does not exist." };
  if (!parent.is_active) return { ok: false, error: "That person is deactivated. Pick someone active." };
  if (!parentAllowed(role, parent.role as UserRole)) {
    return { ok: false, error: `${roleWord(role)[0].toUpperCase()}${roleWord(role).slice(1)} cannot report to ${roleWord(parent.role as UserRole)}.` };
  }
  return { ok: true };
}

// ---------------------------------------------------------------- create

export async function createUserCore(
  supabase: Client,
  admin: AdminAuthClient | null,
  actor: Actor,
  rawInput: unknown,
): Promise<ActionResult<{ userId: string }>> {
  if (actor.role !== "super_admin") return fail(ONLY_SUPER);
  if (!admin) return fail(NO_ADMIN_API);

  const parsed = createUserSchema.safeParse(rawInput);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the form and try again.");
  const input = parsed.data;

  const parent = await checkParent(supabase, input.role, input.parentId);
  if (!parent.ok) return fail(parent.error);

  // 1. the login account
  const { data: created, error: authErr } = await admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
  });
  if (authErr || !created?.user) {
    if (authErr && /already|registered|exists/i.test(authErr.message)) return fail("A user with that email already exists.");
    console.error("[org] auth createUser failed:", authErr?.message);
    return fail("Could not create the login. Try again in a moment.");
  }
  const id = created.user.id;

  // 2. the profile row, through RLS (users_insert requires app.is_super())
  const { error: rowErr } = await supabase.from("users").insert({
    id,
    full_name: input.fullName,
    email: input.email,
    role: input.role,
    parent_id: input.parentId,
  });
  if (rowErr) {
    console.error("[org] users insert failed:", rowErr.code, rowErr.message);
    // Never leave a login that has no profile: roll the auth user back.
    const { error: rollback } = await admin.deleteUser(id);
    if (rollback) console.error("[org] ROLLBACK FAILED for auth user", id, rollback.message);
    if (rowErr.code === "21000") return fail(HIERARCHY_BLOCKED);
    return fail(rowErr.code === "23505" ? "A user with that email already exists." : "Could not save the user. Nothing was created.");
  }
  return ok({ userId: id });
}

// ---------------------------------------------------------------- update / reactivate

export async function updateUserCore(
  supabase: Client,
  admin: AdminAuthClient | null,
  actor: Actor,
  rawInput: unknown,
): Promise<ActionResult<null>> {
  if (actor.role !== "super_admin") return fail(ONLY_SUPER);

  const parsed = updateUserSchema.safeParse(rawInput);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the form and try again.");
  const input = parsed.data;

  const { data: target } = await supabase
    .from("users")
    .select("id, role, is_active, parent_id")
    .eq("id", input.userId)
    .maybeSingle();
  if (!target) return fail("That user does not exist.");
  const role = target.role as UserRole;

  if (role === "super_admin") {
    if (input.parentId !== null) return fail("The super admin does not report to anyone.");
  } else {
    if (input.parentId === null) return fail("Pick who this person reports to.");
    const parent = await checkParent(supabase, role, input.parentId, input.userId);
    if (!parent.ok) return fail(parent.error);
  }

  const reactivating = input.isActive === true && !target.is_active;
  if (reactivating && !admin) return fail(NO_ADMIN_API);

  const phone = input.phone ? normalisePhone(input.phone) : null;
  const { data: updated, error } = await supabase
    .from("users")
    .update({
      full_name: input.fullName,
      phone,
      // Only send parent_id when it changed: any UPDATE that sets it fires the hierarchy rebuild trigger.
      ...(input.parentId !== target.parent_id ? { parent_id: input.parentId } : {}),
      ...(reactivating ? { is_active: true } : {}),
    })
    .eq("id", input.userId)
    .select("id");
  if (error) {
    console.error("[org] update user failed:", error.code, error.message);
    if (error.code === "21000") return fail(HIERARCHY_BLOCKED);
    return fail("Could not save the changes. Try again.");
  }
  if (!updated?.length) return fail("Could not save the changes. You may not have permission.");

  if (reactivating && admin) {
    const { error: unban } = await admin.updateUserById(input.userId, { ban_duration: "none" });
    if (unban) {
      console.error("[org] unban failed:", unban.message);
      // Put it back so the profile and the login never disagree.
      await supabase.from("users").update({ is_active: false }).eq("id", input.userId);
      return fail("Could not re-enable their sign-in. Nothing was changed. Try again.");
    }
  }
  return ok(null);
}

// ---------------------------------------------------------------- deactivate

/**
 * Deactivates a user. Never deletes: the history keeps pointing at real people.
 *
 * Order matters, so that a failure never leaves a half-done state:
 *   1. work out where the open leads go (nothing is written yet)
 *   2. ban the login   (they can no longer refresh a session)
 *   3. move the open leads  (public.move_leads: atomic per batch, history written)
 *   4. set is_active = false
 * If 3 or 4 fails the ban is lifted again.
 *
 * Where leads go (A2.4, D-026): each open lead goes to the ACTIVE manager whose territory covers
 * it; a shared territory is spread evenly; with no covering manager it goes to the leaving
 * person's nearest manager above. `transferTo` overrides all of that and sends everything to
 * one named person.
 *
 * Refuses when active people still report to them: routing skips callers whose manager is
 * inactive, so leaving them attached would silently stop their leads (D-024).
 */
export async function deactivateUserCore(
  supabase: Client,
  admin: AdminAuthClient | null,
  actor: Actor,
  rawInput: unknown,
): Promise<ActionResult<{ transferred: number }>> {
  if (actor.role !== "super_admin") return fail(ONLY_SUPER);
  if (!admin) return fail(NO_ADMIN_API);

  const parsed = deactivateUserSchema.safeParse(rawInput);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the form and try again.");
  const { userId, transferTo } = parsed.data;

  if (userId === actor.id) return fail("You cannot deactivate your own account.");

  const { data: target } = await supabase.from("users").select("id, full_name, role, is_active").eq("id", userId).maybeSingle();
  if (!target) return fail("That user does not exist.");
  if (target.role === "super_admin") return fail("The super admin cannot be deactivated.");
  if (!target.is_active) return fail("That user is already deactivated.");

  const reports = await supabase
    .from("users")
    .select("id", { count: "exact", head: true })
    .eq("parent_id", userId)
    .eq("is_active", true);
  if (reports.error) return fail("Could not check who reports to this user. Try again.");
  if ((reports.count ?? 0) > 0) {
    const n = reports.count ?? 0;
    return fail(`${n} active ${n === 1 ? "person still reports" : "people still report"} to ${target.full_name}. Move them to someone else first (edit each person), then deactivate.`);
  }

  // 1. plan (read-only)
  const plan = await planExitTransfer(supabase, userId, transferTo);
  if (!plan.ok) return fail(plan.error);

  // 2. ban
  const { error: banErr } = await admin.updateUserById(userId, { ban_duration: BAN_FOREVER });
  if (banErr) {
    console.error("[org] ban failed:", banErr.message);
    return fail("Could not revoke their sign-in. Nothing was changed. Try again.");
  }
  const unban = () => admin.updateUserById(userId, { ban_duration: "none" });

  // 3. transfer. Ownership history and the new owner's notification are written inside the same
  // database call. No lead_activities row: it would set first_touch_at and falsely stop a live
  // lead's SLA clock.
  let transferred = 0;
  const moves = plan.data.moves.map((m) => ({ lead: m.leadId, to: m.toUserId }));
  for (const part of chunk(moves, CHUNK)) {
    const { data, error } = await callRpc<number>(supabase, "move_leads", { p_moves: part, p_reason: "exit_transfer", p_restart_sla: false });
    if (error) {
      console.error("[org] move_leads failed:", error.code, error.message);
      await unban();
      if (error.code === "PGRST202") {
        return fail("Automatic transfer needs migration 0007, which has not been applied to this database. Ask Adish to run db push.");
      }
      return fail(
        transferred > 0
          ? `The transfer stopped after ${transferred} of ${moves.length} leads. Their login is unchanged; run it again to finish.`
          : "Could not transfer their leads. Nothing was changed. Try again.",
      );
    }
    transferred += Number(data ?? 0);
  }

  // 4. deactivate
  const { data: done, error: offErr } = await supabase.from("users").update({ is_active: false }).eq("id", userId).select("id");
  if (offErr || !done?.length) {
    console.error("[org] set inactive failed:", offErr?.code, offErr?.message);
    await unban();
    return fail("Could not deactivate the user. Their login is unchanged. Try again.");
  }
  return ok({ transferred });
}

// ---------------------------------------------------------------- forced password change (A3.4)

/**
 * The super admin requires someone to choose a new password at their next sign-in, optionally
 * replacing it with a temporary one first. The temporary password is the practical route when
 * email is not configured: give it to the person privately, and they are made to change it.
 *
 * The flag is app_metadata.must_reset_password (see lib/auth-flags.ts for why there, not a table).
 * Uses the auth-admin API only; it never touches a table.
 */
export async function forcePasswordResetCore(
  supabase: Client,
  admin: AdminAuthClient | null,
  actor: Actor,
  rawInput: unknown,
): Promise<ActionResult<{ temporary: boolean }>> {
  if (actor.role !== "super_admin") return fail(ONLY_SUPER);
  if (!admin) return fail(NO_ADMIN_API);

  const parsed = forcePasswordResetSchema.safeParse(rawInput);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the form and try again.");
  const { userId, temporaryPassword } = parsed.data;

  if (userId === actor.id) return fail("Use Change password for your own account.");

  const { data: target } = await supabase.from("users").select("id, is_active").eq("id", userId).maybeSingle();
  if (!target) return fail("That user does not exist.");
  if (!target.is_active) return fail("That user is deactivated. Reactivate them first.");

  const temporary = !!temporaryPassword;
  const { error } = await admin.updateUserById(userId, {
    app_metadata: { [RESET_FLAG]: true },
    ...(temporary ? { password: temporaryPassword } : {}),
  });
  if (error) {
    console.error("[org] force password reset failed:", error.message);
    return fail("Could not update that user's sign-in. Nothing was changed. Try again.");
  }
  return ok({ temporary });
}
