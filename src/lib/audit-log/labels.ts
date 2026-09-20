/** Plain-language names for audit actions. Shared by the server page and the client filter bar. */
export const ACTION_LABEL: Record<string, string> = {
  view_lead: "Viewed a lead",
  edit_lead: "Edited a lead",
  reassign: "Assigned leads",
  export: "Exported leads",
  import: "Imported leads",
  login: "Signed in",
  delete: "Deleted",
  user_create: "Created a user",
  user_update: "Edited a user",
  user_reactivate: "Reactivated a user",
  user_deactivate: "Deactivated a user",
  password_force_reset: "Forced a password change",
  password_change: "Changed a password",
  scope_change: "Changed a territory",
  project_create: "Created a project",
  project_update: "Edited a project",
  location_create: "Created a location",
  location_update: "Edited a location",
};

export const actionLabel = (a: string) => ACTION_LABEL[a] ?? a;
