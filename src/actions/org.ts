"use server";

import { revalidatePath } from "next/cache";
import { createServerClient } from "@/lib/supabase/server";
import { createAdminAuthClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { createUserCore, deactivateUserCore, forcePasswordResetCore, updateUserCore } from "@/lib/org/mutations";
import { queryDeactivationPreview } from "@/lib/org/queries";
import {
  createLocationCore,
  createProjectCore,
  setScopesCore,
  updateLocationCore,
  updateProjectCore,
} from "@/lib/org/territory";
import { fail, type ActionResult } from "@/types/action";
import type { ForcePasswordResetInput } from "@/lib/schemas/auth";
import type {
  CreateLocationInput,
  CreateProjectInput,
  SetScopesInput,
  UpdateLocationInput,
  UpdateProjectInput,
} from "@/lib/schemas/territory";
import type {
  CreateUserInput,
  DeactivateUserInput,
  DeactivationPreview,
  UpdateUserInput,
} from "@/lib/schemas/user";

// Org actions (super_admin only). RLS is the real permission check; the role test inside the
// core functions only gives a better error message. The service-role AUTH client is created
// here per call and used solely for login accounts (see lib/supabase/admin.ts and D-023).

const SIGN_IN_AGAIN = "Please sign in again.";
const refresh = () => revalidatePath("/users", "layout");

export async function createUser(input: CreateUserInput): Promise<ActionResult<{ userId: string }>> {
  const user = await getCurrentUser();
  if (!user) return fail(SIGN_IN_AGAIN);
  const supabase = await createServerClient();

  const result = await createUserCore(supabase, createAdminAuthClient(), user, input);
  if (result.ok) {
    // Never log the password.
    await logAudit(supabase, user.id, "user_create", "user", result.data.userId, { role: input.role, parentId: input.parentId });
    refresh();
  }
  return result;
}

export async function updateUser(input: UpdateUserInput): Promise<ActionResult<null>> {
  const user = await getCurrentUser();
  if (!user) return fail(SIGN_IN_AGAIN);
  const supabase = await createServerClient();

  const result = await updateUserCore(supabase, createAdminAuthClient(), user, input);
  if (result.ok) {
    await logAudit(supabase, user.id, input.isActive ? "user_reactivate" : "user_update", "user", input.userId, {
      parentId: input.parentId,
    });
    refresh();
  }
  return result;
}

/** What deactivating would touch — shown before the confirm button, as the task requires. */
export async function getDeactivationPreview(userId: string): Promise<ActionResult<DeactivationPreview>> {
  const user = await getCurrentUser();
  if (!user) return fail(SIGN_IN_AGAIN);
  if (user.role !== "super_admin") return fail("Only the super admin can manage users.");
  const supabase = await createServerClient();
  return queryDeactivationPreview(supabase, userId);
}

export async function deactivateUser(input: DeactivateUserInput): Promise<ActionResult<{ transferred: number }>> {
  const user = await getCurrentUser();
  if (!user) return fail(SIGN_IN_AGAIN);
  const supabase = await createServerClient();

  const result = await deactivateUserCore(supabase, createAdminAuthClient(), user, input);
  if (result.ok) {
    await logAudit(supabase, user.id, "user_deactivate", "user", input.userId, {
      transferredTo: input.transferTo ?? null,
      transferred: result.data.transferred,
    });
    refresh();
  }
  return result;
}

// ---------------------------------------------------------------- territories, projects, locations

const refreshTerritories = () => {
  revalidatePath("/territories", "layout");
  revalidatePath("/leads", "layout");
};

export async function setScopes(input: SetScopesInput): Promise<ActionResult<null>> {
  const user = await getCurrentUser();
  if (!user) return fail(SIGN_IN_AGAIN);
  const supabase = await createServerClient();

  const result = await setScopesCore(supabase, user, input);
  if (result.ok) {
    await logAudit(supabase, user.id, "scope_change", "user", input.userId, {
      projectIds: input.projectIds,
      locationIds: input.locationIds,
    });
    refreshTerritories();
  }
  return result;
}

export async function createProject(input: CreateProjectInput): Promise<ActionResult<{ projectId: string }>> {
  const user = await getCurrentUser();
  if (!user) return fail(SIGN_IN_AGAIN);
  const supabase = await createServerClient();

  const result = await createProjectCore(supabase, user, input);
  if (result.ok) {
    await logAudit(supabase, user.id, "project_create", "project", result.data.projectId, { name: input.name, locationId: input.locationId });
    refreshTerritories();
  }
  return result;
}

export async function updateProject(input: UpdateProjectInput): Promise<ActionResult<null>> {
  const user = await getCurrentUser();
  if (!user) return fail(SIGN_IN_AGAIN);
  const supabase = await createServerClient();

  const result = await updateProjectCore(supabase, user, input);
  if (result.ok) {
    await logAudit(supabase, user.id, "project_update", "project", input.projectId, { name: input.name, locationId: input.locationId, isActive: input.isActive });
    refreshTerritories();
  }
  return result;
}

export async function createLocation(input: CreateLocationInput): Promise<ActionResult<{ locationId: string }>> {
  const user = await getCurrentUser();
  if (!user) return fail(SIGN_IN_AGAIN);
  const supabase = await createServerClient();

  const result = await createLocationCore(supabase, user, input);
  if (result.ok) {
    await logAudit(supabase, user.id, "location_create", "location", result.data.locationId, { name: input.name, city: input.city });
    refreshTerritories();
  }
  return result;
}

export async function updateLocation(input: UpdateLocationInput): Promise<ActionResult<null>> {
  const user = await getCurrentUser();
  if (!user) return fail(SIGN_IN_AGAIN);
  const supabase = await createServerClient();

  const result = await updateLocationCore(supabase, user, input);
  if (result.ok) {
    await logAudit(supabase, user.id, "location_update", "location", input.locationId, { name: input.name, city: input.city });
    refreshTerritories();
  }
  return result;
}

// ---------------------------------------------------------------- forced password change (A3.4)

export async function forcePasswordReset(input: ForcePasswordResetInput): Promise<ActionResult<{ temporary: boolean }>> {
  const user = await getCurrentUser();
  if (!user) return fail(SIGN_IN_AGAIN);
  const supabase = await createServerClient();

  const result = await forcePasswordResetCore(supabase, createAdminAuthClient(), user, input);
  if (result.ok) {
    // Never log the temporary password itself, only that one was set.
    await logAudit(supabase, user.id, "password_force_reset", "user", input.userId, { temporary: result.data.temporary });
    refresh();
  }
  return result;
}
