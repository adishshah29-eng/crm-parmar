import type { CallStatus, PipelineStage, Temperature } from "@/types/leads";

// Display labels in one place. Colours live in StatusBadge and nowhere else.

export const CALL_STATUS_LABEL: Record<CallStatus, string> = {
  new: "New",
  attempted: "Attempted",
  connected: "Connected",
  lost: "Lost",
};

export const TEMPERATURE_LABEL: Record<Temperature, string> = {
  hot: "Hot",
  warm: "Warm",
  cold: "Cold",
};

export const STAGE_LABEL: Record<PipelineStage, string> = {
  enquiry: "Enquiry",
  qualified: "Qualified",
  site_visit_scheduled: "Visit scheduled",
  site_visit_done: "Visit done",
  negotiation: "Negotiation",
  booked: "Booked",
  dropped: "Dropped",
};

export const ACTIVITY_LABEL: Record<string, string> = {
  call: "Call",
  remark: "Remark",
  status_change: "Status change",
  stage_change: "Stage change",
  assignment: "Assignment",
  site_visit: "Site visit",
};
