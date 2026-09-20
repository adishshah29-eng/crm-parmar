import { StatusBadge } from "@/components/shared/StatusBadge";
import type { Column } from "@/components/shared/DataTable";
import { formatPhone, formatWhen } from "@/lib/format";
import type { LeadRow } from "@/types/leads";

/**
 * Ready-made columns for any lead table. Pick the ones your portal needs:
 *
 *   columns={[leadColumns.buyer, leadColumns.project, leadColumns.callStatus, ...]}
 *
 * Need a different one? Add it HERE with a default so the other portals are unaffected —
 * do not write a private column in your own folder.
 *
 * If a cell holds its own link or button, give it `relative z-10` so it sits above the
 * row-stretching link.
 */
export const leadColumns = {
  buyer: {
    key: "buyer",
    header: "Buyer",
    primary: true,
    cell: (r) => (
      <div className="min-w-0">
        <p className="truncate font-medium">{r.personName ?? "Unnamed"}</p>
        <p className="text-xs text-muted-foreground">{formatPhone(r.phone)}</p>
      </div>
    ),
  },
  project: {
    key: "project",
    header: "Project",
    className: "hidden md:table-cell",
    cell: (r) => r.projectName,
  },
  callStatus: {
    key: "callStatus",
    header: "Status",
    cell: (r) => <StatusBadge kind="call_status" value={r.callStatus} />,
  },
  temperature: {
    key: "temperature",
    header: "Temp",
    className: "hidden sm:table-cell",
    cell: (r) => (r.temperature ? <StatusBadge kind="temperature" value={r.temperature} /> : <span className="text-muted-foreground">—</span>),
  },
  stage: {
    key: "stage",
    header: "Stage",
    className: "hidden lg:table-cell",
    cell: (r) => <StatusBadge kind="pipeline_stage" value={r.pipelineStage} />,
  },
  owner: {
    key: "owner",
    header: "Owner",
    className: "hidden lg:table-cell",
    // null = unassigned, or an owner outside what this user is allowed to see
    cell: (r) => r.ownerName ?? <span className="text-muted-foreground">{r.assignedTo ? "Another team" : "Unassigned"}</span>,
  },
  lastActivity: {
    key: "lastActivity",
    header: "Last activity",
    sortKey: "last_activity_at",
    className: "hidden md:table-cell",
    cell: (r) => (r.lastActivityAt ? formatWhen(r.lastActivityAt) : <span className="text-muted-foreground">None yet</span>),
  },
  nextCall: {
    key: "nextCall",
    header: "Next call",
    sortKey: "next_call_at",
    className: "hidden sm:table-cell",
    cell: (r) => (r.nextCallAt ? formatWhen(r.nextCallAt) : <span className="text-muted-foreground">—</span>),
  },
  /**
   * Breach flag only. The countdown (amber under 15 min) is Arisha's B2.4 / Tanishka's C1.3
   * and must use app.add_working_minutes — never client-side date arithmetic.
   */
  sla: {
    key: "sla",
    header: "SLA",
    sortKey: "sla_due_at",
    cell: (r) => {
      if (r.slaBreachedAt) return <StatusBadge kind="sla_breached" />;
      if (r.isLive && !r.firstTouchAt && r.slaDueAt) return <span className="text-xs text-muted-foreground">Due {formatWhen(r.slaDueAt)}</span>;
      return null;
    },
  },
  created: {
    key: "created",
    header: "Received",
    sortKey: "created_at",
    className: "hidden xl:table-cell",
    cell: (r) => formatWhen(r.createdAt),
  },
} satisfies Record<string, Column<LeadRow>>;
