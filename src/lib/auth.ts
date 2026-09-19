import { cache } from "react";
import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import type { UserRole } from "@/types/action";

export type CurrentUser = {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
  parentId: string | null;
};

/** The signed-in user's row from public.users, or null. Cached per request. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("users")
    .select("id, full_name, email, role, parent_id, is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (!data || data.is_active === false) return null;
  return {
    id: data.id,
    fullName: data.full_name,
    email: data.email,
    role: data.role as UserRole,
    parentId: data.parent_id,
  };
});

/** For pages and layouts: the user, or redirect to /login. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Where each role lands after sign-in. */
export const homeFor = (role: UserRole) => (role === "caller" ? "/my-day" : "/dashboard");
