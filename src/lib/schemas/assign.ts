import { z } from "zod";

const guid = z.guid();

/** Reasons an admin can record. exit_transfer is written only by deactivation. */
export const ASSIGN_REASONS = ["manual", "escalation"] as const;

export const reassignSchema = z.object({
  leadId: guid,
  toUserId: z.guid("Pick who should take the lead"),
  reason: z.enum(ASSIGN_REASONS).optional(),
});
export type ReassignInput = z.infer<typeof reassignSchema>;

export const bulkAssignSchema = z.object({
  leadIds: z.array(guid).min(1, "Select at least one lead").max(500, "Assign at most 500 leads at a time"),
  toUserId: z.guid("Pick who should take the leads"),
  reason: z.enum(ASSIGN_REASONS).optional(),
});
export type BulkAssignInput = z.infer<typeof bulkAssignSchema>;
