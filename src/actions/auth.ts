"use server";

import { createServerClient } from "@/lib/supabase/server";
import { resetRequestSchema, signInSchema } from "@/lib/schemas/auth";
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
