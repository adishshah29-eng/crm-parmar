import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export type AuditAction =
  | "view_lead"
  | "edit_lead"
  | "reassign"
  | "export"
  | "login"
  | "delete"
  | "user_create"
  | "user_update"
  | "user_reactivate"
  | "user_deactivate"
  | "import"
  | "password_force_reset"
  | "password_change"
  | "scope_change"
  | "project_create"
  | "project_update"
  | "location_create"
  | "location_update";

/**
 * Append one row to audit_log. Never throws: an audit failure must not break the action,
 * but it is logged loudly. Call it for detail-page opens, edits, reassign, export, delete
 * and login — NEVER for list queries (that would outgrow the leads on a 500 MB tier).
 */
export async function logAudit(
  supabase: SupabaseClient<Database>,
  actorId: string,
  action: AuditAction,
  entityType: string,
  entityId: string,
  meta?: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase.from("audit_log").insert({
    actor_id: actorId,
    action,
    entity_type: entityType,
    entity_id: entityId,
    meta: (meta ?? null) as never,
  });
  if (error) console.error(`[audit] failed to log ${action}:`, error.code);
}

/** Every action, for the audit viewer's filter. Keep in step with AuditAction. */
export const AUDIT_ACTIONS: readonly AuditAction[] = [
  "login",
  "view_lead",
  "edit_lead",
  "reassign",
  "export",
  "import",
  "user_create",
  "user_update",
  "user_reactivate",
  "user_deactivate",
  "password_force_reset",
  "password_change",
  "scope_change",
  "project_create",
  "project_update",
  "location_create",
  "location_update",
  "delete",
];

/**
 * Like logAudit, but tells the caller whether the row was written. Use it where the audit row IS the
 * control and the action must not go ahead without it: an export is only allowed to leave the
 * system if its audit row exists (D-013).
 */
export async function logAuditStrict(
  supabase: SupabaseClient<Database>,
  actorId: string,
  action: AuditAction,
  entityType: string,
  entityId: string | null,
  meta?: Record<string, unknown>,
): Promise<boolean> {
  const { error } = await supabase.from("audit_log").insert({
    actor_id: actorId,
    action,
    entity_type: entityType,
    entity_id: entityId,
    meta: (meta ?? null) as never,
  });
  if (error) console.error(`[audit] STRICT write failed for ${action}:`, error.code);
  return !error;
}
