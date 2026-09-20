import { getLead } from "@/actions/leads";
import { AssignLeadPanel } from "@/components/admin/AssignLeadPanel";
import { ActivityTimeline } from "@/components/shared/ActivityTimeline";
import { LeadDetailShell } from "@/components/shared/LeadDetailShell";
import { LeadSources } from "@/components/shared/LeadSources";
import { LeadSummary } from "@/components/shared/LeadSummary";
import { ErrorState, NoAccess } from "@/components/shared/states";
import { requireUser } from "@/lib/auth";
import { queryActiveUsers } from "@/lib/org/queries";
import { can } from "@/lib/permissions";
import { createServerClient } from "@/lib/supabase/server";
import { NO_ACCESS } from "@/types/leads";

export const metadata = { title: "Lead · Parmar CRM" };

// Reference lead detail. Each portal builds its own route on the same shell and fills the
// `actions` slot with its own controls. Admin's control is assign / reassign (task A2.3).
export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const result = await getLead(id); // also writes the view_lead audit row

  if (!result.ok) {
    // RLS returns zero rows for a lead you may not read: say so, never a blank page.
    return result.error === NO_ACCESS ? <NoAccess message={NO_ACCESS + "."} /> : <ErrorState message={result.error} />;
  }
  const lead = result.data;

  let actions = null;
  if (can.viewAllLeads(user.role)) {
    const supabase = await createServerClient();
    const people = await queryActiveUsers(supabase);
    const assignees = (people.ok ? people.data : []).filter((p) => p.role === "manager" || p.role === "sub_manager" || p.role === "caller");
    actions = <AssignLeadPanel leadId={lead.id} currentOwnerId={lead.assignedTo} currentOwnerName={lead.ownerName} assignees={assignees} />;
  }

  return (
    <LeadDetailShell
      backHref="/leads"
      header={<LeadSummary lead={lead} />}
      actions={actions}
      timeline={<ActivityTimeline activities={lead.activities} />}
      aside={<LeadSources sources={lead.sources} />}
    />
  );
}
