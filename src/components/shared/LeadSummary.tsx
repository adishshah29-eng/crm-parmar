import { Phone } from "lucide-react";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { formatDateTime, formatPhone, formatRupees, formatWhen, telHref } from "@/lib/format";
import type { LeadDetail } from "@/types/leads";

/**
 * Default header for a lead. The phone number is a tap-to-dial link and is deliberately the
 * largest thing on the screen: callers dial from their own phones, so it is the most-used
 * element in the product (D-012).
 */
export function LeadSummary({ lead }: { lead: LeadDetail }) {
  const budget =
    lead.budgetMin != null || lead.budgetMax != null
      ? [lead.budgetMin, lead.budgetMax].map((n) => (n != null ? formatRupees(n) : "?")).join(" – ")
      : null;

  return (
    <section className="space-y-3 rounded-2xl bg-card shadow-sm p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h1 className="truncate text-xl font-semibold tracking-tight">{lead.personName ?? "Unnamed buyer"}</h1>
          <p className="text-sm text-muted-foreground">
            {lead.projectName}
            {lead.developer ? ` · ${lead.developer}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusBadge kind="call_status" value={lead.callStatus} />
          {lead.temperature && <StatusBadge kind="temperature" value={lead.temperature} />}
          <StatusBadge kind="pipeline_stage" value={lead.pipelineStage} />
          {lead.slaBreachedAt && <StatusBadge kind="sla_breached" />}
        </div>
      </div>

      <a
        href={telHref(lead.phone)}
        className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-lg font-semibold text-primary-foreground hover:bg-primary/90 sm:w-auto"
      >
        <Phone className="size-5" aria-hidden />
        {formatPhone(lead.phone)}
      </a>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
        <Fact label="Owner" value={lead.ownerName ?? (lead.assignedTo ? "Another team" : "Unassigned")} />
        <Fact label="Budget" value={budget} />
        <Fact label="Next call" value={lead.nextCallAt ? formatWhen(lead.nextCallAt) : null} />
        <Fact label="Received" value={formatDateTime(lead.createdAt)} />
        {lead.email && <Fact label="Email" value={lead.email} />}
        {lead.renurtureAt && <Fact label="Re-nurture" value={formatDateTime(lead.renurtureAt)} />}
      </dl>

      {lead.notes && <p className="rounded-md bg-muted p-3 text-sm whitespace-pre-wrap">{lead.notes}</p>}
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="truncate font-medium">{value ?? <span className="font-normal text-muted-foreground">—</span>}</dd>
    </div>
  );
}
