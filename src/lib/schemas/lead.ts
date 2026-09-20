import { z } from "zod";

// One definition per rule. The form AND the server action import the same schema,
// so the mandatory-field rules from brain/05-lead-flow.md live in exactly one place.

// z.guid(), not z.uuid(): zod 4's uuid() enforces RFC-4122 version bits and rejects the seed's
// readable ids (22222222-0000-...). Any 8-4-4-4-12 hex id is fine here; Postgres validates the rest.
const uuid = z.guid();
const isoDateTime = z.iso.datetime({ offset: true });

export const CALL_STATUSES = ["new", "attempted", "connected", "lost"] as const;
export const TEMPERATURES = ["hot", "warm", "cold"] as const;
export const PIPELINE_STAGES = [
  "enquiry",
  "qualified",
  "site_visit_scheduled",
  "site_visit_done",
  "negotiation",
  "booked",
  "dropped",
] as const;

/** What a caller can pick after a call. `new` is the default state, never a choice. */
export const CALL_OUTCOMES = ["attempted", "connected", "lost"] as const;

export const callOutcomeSchema = z
  .object({
    leadId: uuid,
    callStatus: z.enum(CALL_OUTCOMES),
    temperature: z.enum(TEMPERATURES).optional(),
    remark: z.string().trim().max(2000, "Keep the remark under 2000 characters"),
    nextCallAt: isoDateTime.optional(),
    /** Only meaningful for `lost`. Defaults to +6 months when omitted. */
    renurtureAt: isoDateTime.optional(),
  })
  .superRefine((v, ctx) => {
    const need = (path: keyof typeof v, message: string) =>
      ctx.addIssue({ code: "custom", path: [path], message });

    if (v.callStatus === "attempted") {
      if (!v.nextCallAt) need("nextCallAt", "Set the next call date");
    }
    if (v.callStatus === "connected") {
      if (!v.temperature) need("temperature", "Pick hot, warm or cold");
      if (!v.remark) need("remark", "Add a remark about the conversation");
      // 05-lead-flow.md exempts booked/dropped, but a call outcome can never land on those:
      // callers cannot book, and `lost` is its own branch. So it is always required here.
      if (!v.nextCallAt) need("nextCallAt", "Set the next call date");
    }
    if (v.callStatus === "lost") {
      if (!v.remark) need("remark", "Say why the lead is lost");
    }
  });

export type CallOutcomeInput = z.infer<typeof callOutcomeSchema>;

export const addRemarkSchema = z.object({
  leadId: uuid,
  remark: z.string().trim().min(1, "Write a remark").max(2000, "Keep the remark under 2000 characters"),
});

// ---------------------------------------------------------------- lists

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

export const leadFiltersSchema = z.object({
  /** Matches buyer name, or any part of the phone number. */
  search: z.string().trim().max(80).optional(),
  callStatus: z.array(z.enum(CALL_STATUSES)).max(4).optional(),
  temperature: z.array(z.enum(TEMPERATURES)).max(3).optional(),
  stage: z.array(z.enum(PIPELINE_STAGES)).max(7).optional(),
  projectId: z.array(uuid).max(50).optional(),
  /** "me" = my own leads, "team" = my descendants, "none" = unassigned, uuid = one person. A filter, not a permission. */
  assignedTo: z.union([z.enum(["me", "team", "none"]), uuid, z.string().regex(/^team:[0-9a-fA-F-]{36}$/)]).optional(),
  sourceCode: z.array(z.string().trim().min(1).max(30)).max(10).optional(),
  createdFrom: day.optional(),
  createdTo: day.optional(),
  slaBreached: z.boolean().optional(),
  untouched: z.boolean().optional(),
});

export type LeadFilters = z.infer<typeof leadFiltersSchema>;

export const LEAD_SORT_COLUMNS = [
  "created_at",
  "last_activity_at",
  "next_call_at",
  "sla_due_at",
  "assigned_at",
] as const;

export const leadListParamsSchema = z.object({
  page: z.number().int().min(1).max(10_000).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
  /** `column:asc` or `column:desc`, column from LEAD_SORT_COLUMNS. */
  sort: z.string().regex(new RegExp(`^(${LEAD_SORT_COLUMNS.join("|")}):(asc|desc)$`)).optional(),
  filters: leadFiltersSchema.optional(),
});

export type LeadListParams = z.infer<typeof leadListParamsSchema>;
