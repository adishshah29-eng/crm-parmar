import { z } from "zod";

// Shared by the forms and the server actions (one definition per rule).
// guid, not uuid: zod 4's uuid() rejects the seed's readable ids. See lib/schemas/lead.ts.

const guid = z.guid();
const name = (label: string) =>
  z.string().trim().min(2, `Enter the ${label}`).max(80, `Keep the ${label} under 80 characters`);

/** Blank means "not recorded" and is stored as null. */
const optionalText = z.string().trim().max(80, "Keep it under 80 characters").optional();

export const setScopesSchema = z.object({
  userId: guid,
  projectIds: z.array(guid).max(200),
  locationIds: z.array(guid).max(100),
});
export type SetScopesInput = z.infer<typeof setScopesSchema>;

export const createLocationSchema = z.object({
  name: name("location name"),
  city: z.string().trim().min(2, "Enter the city").max(40, "Keep the city under 40 characters"),
});
export type CreateLocationInput = z.infer<typeof createLocationSchema>;

export const updateLocationSchema = createLocationSchema.extend({ locationId: guid });
export type UpdateLocationInput = z.infer<typeof updateLocationSchema>;

export const createProjectSchema = z.object({
  name: name("project name"),
  locationId: z.guid("Pick a location"),
  developer: optionalText,
});
export type CreateProjectInput = z.infer<typeof createProjectSchema>;

export const updateProjectSchema = createProjectSchema.extend({
  projectId: guid,
  isActive: z.boolean(),
});
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;

/** One scope row of one manager, as the overlap check needs it. */
export type ScopeRow = { userId: string; projectId: string | null; locationId: string | null };
