import { z } from "zod";
import { normalisePhone } from "@/lib/format";
import type { UserRole } from "@/types/action";

// One definition per rule, shared by the forms and the server actions (brain/07-ui-conventions.md).

const guid = z.guid();
/** For the "reports to" pick: an empty select must read as a missing choice, not "Invalid GUID". */
const parentGuid = z.guid("Pick who they report to");

export const ALL_ROLES = ["super_admin", "admin", "manager", "sub_manager", "caller"] as const;

/** There is exactly one super_admin (01-product.md), so nobody can create another. */
export const CREATABLE_ROLES = ["admin", "manager", "sub_manager", "caller"] as const;
export type CreatableRole = (typeof CREATABLE_ROLES)[number];

export const ROLE_LABEL: Record<UserRole, string> = {
  super_admin: "Super admin",
  admin: "Admin",
  manager: "Manager",
  sub_manager: "Sub manager",
  caller: "Caller",
};

/**
 * Who a user of each role may report to. From brain/tasks/adish-tasks.md A1.2:
 * a caller's parent is a manager or sub_manager; a sub_manager's parent is a manager;
 * a manager's parent is an admin or super_admin; a parent is required for every role
 * except super_admin.
 *
 * ASSUMPTION: the task file does not say who an admin reports to. Admins report to the
 * super_admin, matching the seed data and 04-access-control.md. Confirm or change here.
 */
export const PARENT_ROLES: Record<UserRole, readonly UserRole[]> = {
  super_admin: [],
  admin: ["super_admin"],
  manager: ["admin", "super_admin"],
  sub_manager: ["manager"],
  caller: ["manager", "sub_manager"],
};

export const parentAllowed = (role: UserRole, parentRole: UserRole) => PARENT_ROLES[role].includes(parentRole);

const fullName = z.string().trim().min(2, "Enter the full name").max(80, "Keep the name under 80 characters");

/** Empty is allowed (stored as null). Anything else must be a valid Indian or international number. */
const optionalPhone = z
  .string()
  .trim()
  .max(24)
  .optional()
  .refine((v) => !v || normalisePhone(v) !== null, "Enter a valid phone number");

export const createUserSchema = z.object({
  fullName,
  email: z.string().trim().toLowerCase().email("Enter a valid email address").max(120),
  password: z.string().min(8, "Use at least 8 characters").max(72, "Use at most 72 characters"),
  role: z.enum(CREATABLE_ROLES, { error: "Pick a role" }),
  parentId: parentGuid,
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = z.object({
  userId: guid,
  fullName,
  phone: optionalPhone,
  /** null only for the super_admin. */
  parentId: parentGuid.nullable(),
  /** Only `true` is accepted here (reactivate). Deactivating goes through deactivateUser. */
  isActive: z.literal(true).optional(),
});
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const deactivateUserSchema = z.object({
  userId: guid,
  /** Required when the user still has open leads. */
  transferTo: guid.optional(),
});
export type DeactivateUserInput = z.infer<typeof deactivateUserSchema>;

export type DeactivationPreview = {
  openLeads: number;
  /** Active people who report directly to this user. */
  activeReports: number;
  /** Where the open leads would go under the automatic rule (A2.4). Empty when there are none. */
  receivers: { userId: string; fullName: string; count: number; fallback: boolean }[];
  /** Set when the automatic rule cannot place every lead; the super admin must name a person. */
  planError: string | null;
};

export const userListParamsSchema = z.object({
  role: z.enum(ALL_ROLES).optional(),
  search: z.string().trim().max(80).optional(),
});
export type UserListParams = z.infer<typeof userListParamsSchema>;
