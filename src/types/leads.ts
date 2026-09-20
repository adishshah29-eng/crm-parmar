import type { Database } from "@/types/database";

type Enums = Database["public"]["Enums"];
export type CallStatus = Enums["call_status"];
export type Temperature = Enums["temperature"];
export type PipelineStage = Enums["pipeline_stage"];

/** Returned whenever RLS hides a lead. Pages render <NoAccess> for this. */
export const NO_ACCESS = "You don't have access to this lead";

/** One row in any lead list. Every portal gets this shape; RLS decides which rows. */
export type LeadRow = {
  id: string;
  personName: string | null;
  phone: string;
  projectId: string;
  projectName: string;
  callStatus: CallStatus;
  temperature: Temperature | null;
  pipelineStage: PipelineStage;
  /** null when unassigned, or when the owner is outside what this user may see. */
  ownerName: string | null;
  assignedTo: string | null;
  isLive: boolean;
  firstTouchAt: string | null;
  lastActivityAt: string | null;
  nextCallAt: string | null;
  slaDueAt: string | null;
  slaBreachedAt: string | null;
  createdAt: string;
};

export type LeadActivity = {
  id: string;
  activityType: string;
  remark: string | null;
  fromValue: string | null;
  toValue: string | null;
  createdAt: string;
  userName: string | null;
};

export type LeadSourceEntry = {
  code: string;
  name: string;
  isLive: boolean;
  campaign: string | null;
  receivedAt: string;
};

export type LeadDetail = LeadRow & {
  personId: string;
  email: string | null;
  developer: string | null;
  budgetMin: number | null;
  budgetMax: number | null;
  notes: string | null;
  renurtureAt: string | null;
  assignedAt: string | null;
  sources: LeadSourceEntry[];
  /** Newest first, capped at 100. */
  activities: LeadActivity[];
};
