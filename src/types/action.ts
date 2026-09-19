/** Every server action returns this. Never throw raw Postgres errors at the UI. */
export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

export const ok = <T>(data: T): ActionResult<T> => ({ ok: true, data });
export const fail = (error: string): ActionResult<never> => ({ ok: false, error });

export type UserRole = "super_admin" | "admin" | "manager" | "sub_manager" | "caller";
