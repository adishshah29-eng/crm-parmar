import type { UserRole } from "@/types/action";

export type NavItem = { label: string; href: string; roles: UserRole[] };

const ADMINS: UserRole[] = ["super_admin", "admin"];
const SUPERVISORS: UserRole[] = ["manager", "sub_manager"];
const EVERYONE: UserRole[] = [...ADMINS, ...SUPERVISORS, "caller"];

/**
 * Role-aware sidebar. Adding a screen = adding a line here, in the same PR that creates the route.
 * This decides what to SHOW; RLS decides what is allowed.
 */
export const NAV: NavItem[] = [
  // Everyone
  { label: "My Day", href: "/my-day", roles: ["caller"] },
  { label: "Dashboard", href: "/dashboard", roles: [...ADMINS, ...SUPERVISORS] },
  // Admin console (Adish)
  { label: "All leads", href: "/leads", roles: ADMINS },
  { label: "Users", href: "/users", roles: ["super_admin"] },
  { label: "Territories", href: "/territories", roles: ["super_admin"] },
  { label: "Import", href: "/import", roles: ADMINS },
  { label: "Audit log", href: "/audit", roles: ADMINS },
  // Manager portal (Arisha)
  { label: "Team leads", href: "/team/leads", roles: SUPERVISORS },
  { label: "Team", href: "/team", roles: SUPERVISORS },
  { label: "Escalations", href: "/team/escalations", roles: SUPERVISORS },
  // Ops (Sayli), cross-cutting
  { label: "Attendance", href: "/attendance", roles: EVERYONE },
  { label: "Site visits", href: "/visits", roles: EVERYONE },
];

export const navFor = (role: UserRole) => NAV.filter((i) => i.roles.includes(role));
