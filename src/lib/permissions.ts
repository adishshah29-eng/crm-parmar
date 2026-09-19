import type { UserRole } from "@/types/action";

/**
 * What to SHOW, never what is ALLOWED. RLS in Postgres decides what is allowed.
 * Mirrors the action matrix in brain/04-access-control.md.
 */
const isAdmin = (r: UserRole) => r === "super_admin" || r === "admin";
const isSuper = (r: UserRole) => r === "super_admin";
const isSupervisor = (r: UserRole) => r === "manager" || r === "sub_manager";

export const can = {
  export: isAdmin,
  import: isAdmin,
  manageUsers: isSuper,
  editTerritories: isSuper,
  deleteLead: isSuper,
  viewAuditLog: isAdmin,
  reassign: (r: UserRole) => isAdmin(r) || isSupervisor(r),
  // Callers never pick negotiation/booked; their stage moves come from events (see 05-lead-flow.md).
  manuallySetNegotiationOrBooked: (r: UserRole) => isAdmin(r) || isSupervisor(r),
  viewTeamAttendance: (r: UserRole) => isAdmin(r) || isSupervisor(r),
  viewAllLeads: isAdmin,
  setOwnAvailability: () => true,
};
