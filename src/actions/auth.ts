"use server";

import { createServerClient } from "@/lib/supabase/server";
import { createAdminAuthClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { mustResetPassword, RESET_FLAG } from "@/lib/auth-flags";
import { resetRequestSchema, setPasswordSchema, signInSchema, type SetPasswordInput } from "@/lib/schemas/auth";
import { fail, ok, type ActionResult } from "@/types/action";

export async function signIn(
  email: string,
  password: string,
): Promise<ActionResult<{ userId: string }>> {
  const parsed = signInSchema.safeParse({ email, password });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input");

  const supabase = await createServerClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error || !data.user) return fail("Incorrect email or password");

  // A deactivated user must not get a session (users_select lets them read their own row).
  const { data: profile } = await supabase
    .from("users")
    .select("is_active")
    .eq("id", data.user.id)
    .maybeSingle();

  if (!profile) {
    await supabase.auth.signOut();
    return fail("Your account is not set up yet. Ask Adish or Gautam.");
  }
  if (profile.is_active === false) {
    await supabase.auth.signOut();
    return fail("Your account has been deactivated.");
  }

  // audit_insert policy requires actor_id = auth.uid(), so this is allowed for every role.
  await supabase.from("audit_log").insert({
    actor_id: data.user.id,
    action: "login",
    entity_type: "user",
    entity_id: data.user.id,
  });

  return ok({ userId: data.user.id });
}

export async function signOut(): Promise<ActionResult<null>> {
  const supabase = await createServerClient();
  const { error } = await supabase.auth.signOut();
  if (error) return fail("Could not sign out. Try again.");
  return ok(null);
}

export async function requestPasswordReset(email: string): Promise<ActionResult<null>> {
  const parsed = resetRequestSchema.safeParse({ email });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid email");

  const supabase = await createServerClient();
  await supabase.auth.resetPasswordForEmail(parsed.data.email);
  // Always succeed: never reveal whether an email has an account.
  return ok(null);
}

/**
 * Change the signed-in user's password (task A3.4). Used three ways: after an email reset link
 * (the link signs them in first), when a super admin has forced a change, and voluntarily.
 * If the change was forced, the flag is cleared only AFTER the password really changed.
 */
export async function setPassword(input: SetPasswordInput): Promise<ActionResult<null>> {
  const parsed = setPasswordSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the passwords and try again.");

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail("Your session has ended. Sign in again, or request a new reset link.");

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    console.error("[auth] updateUser password failed:", error.code, error.message);
    if (error.code === "same_password") return fail("Choose a password you are not already using.");
    if (error.code === "weak_password") return fail("That password is too easy to guess. Try a longer or less common one.");
    return fail("Could not change the password. Try again.");
  }

  if (mustResetPassword(user)) {
    // app_metadata can only be written with the admin API. This is the one auth-user write that
    // happens on behalf of a non-super-admin, and it touches only the caller's own id.
    const admin = createAdminAuthClient();
    const { error: clearErr } = admin
      ? await admin.updateUserById(user.id, { app_metadata: { [RESET_FLAG]: false } })
      : { error: new Error("no admin client") };
    if (clearErr) {
      console.error("[auth] could not clear the forced-change flag:", clearErr.message);
      return fail("Your password was changed, but the change requirement could not be cleared. Ask the super admin to help.");
    }
  }

  await logAudit(supabase, user.id, "password_change", "user", user.id);
  return ok(null);
}
