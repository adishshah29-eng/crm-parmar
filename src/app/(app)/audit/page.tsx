import Link from "next/link";
import { AuditFilters } from "@/components/admin/AuditFilters";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { EmptyState, ErrorState, NoAccess } from "@/components/shared/states";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireUser } from "@/lib/auth";
import { actionLabel } from "@/lib/audit-log/labels";
import { describeFilters, entityHref, queryAuditLog, queryRecentExports, summariseMeta, type AuditRow } from "@/lib/audit-log/queries";
import { formatDateTime } from "@/lib/format";
import type { SearchParams } from "@/lib/leads/params";
import { queryUsers } from "@/lib/org/queries";
import { can } from "@/lib/permissions";
import { createServerClient } from "@/lib/supabase/server";

export const metadata = { title: "Audit log · Parmar CRM" };

const PAGE_SIZE = 50;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

// Task A3.3. Admin and super_admin only. Exports come first because that is the view that answers
// "did someone take the database" (D-013).
export default async function AuditPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const me = await requireUser();
  if (!can.viewAuditLog(me.role)) return <NoAccess message="The audit log is not available for your role." />;

  const sp = await searchParams;
  const page = Math.max(1, Number.parseInt(first(sp.page) ?? "1", 10) || 1);

  const supabase = await createServerClient();
  const [exports, log, users] = await Promise.all([
    queryRecentExports(supabase),
    queryAuditLog(supabase, {
      actor: first(sp.actor),
      action: first(sp.action),
      from: first(sp.from),
      to: first(sp.to),
      page,
      pageSize: PAGE_SIZE,
    }),
    queryUsers(supabase, {}),
  ]);

  const actors = (users.ok ? users.data : []).map((u) => ({ id: u.id, name: u.fullName }));

  const columns: Column<AuditRow>[] = [
    { key: "when", header: "When", cell: (r) => <span className="whitespace-nowrap">{formatDateTime(r.at)}</span> },
    { key: "who", header: "Who", cell: (r) => r.actorName ?? <span className="text-muted-foreground">—</span> },
    { key: "what", header: "What", cell: (r) => actionLabel(r.action) },
    {
      key: "about",
      header: "About",
      className: "hidden md:table-cell",
      cell: (r) => {
        const href = entityHref(r.entityType, r.entityId);
        const label = r.entityType ? `${r.entityType}${r.entityId ? ` ${r.entityId.slice(0, 8)}` : ""}` : "—";
        // z-10 keeps the link clickable above the (unused) row-stretch layer
        return href ? (
          <Link href={href} className="relative z-10 underline-offset-2 hover:underline">{label}</Link>
        ) : (
          <span className="text-muted-foreground">{label}</span>
        );
      },
    },
    { key: "detail", header: "Detail", className: "hidden lg:table-cell", cell: (r) => <span className="text-xs text-muted-foreground">{summariseMeta(r.action, r.meta)}</span> },
  ];

  return (
    <div className="space-y-8">
      <h1 className="text-xl font-semibold tracking-tight">Audit log</h1>

      <section className="space-y-2" aria-labelledby="exports-heading">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <h2 id="exports-heading" className="text-lg font-semibold">Exports</h2>
          <span className="text-sm text-muted-foreground">Every time someone took a copy of lead data out of the system</span>
        </div>
        {!exports.ok ? (
          <ErrorState message={exports.error} />
        ) : exports.data.rows.length === 0 ? (
          <EmptyState title="No exports yet" hint="When an admin exports leads to CSV it appears here with who, when, how many leads and which filter." />
        ) : (
          <div className="overflow-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Who</TableHead>
                  <TableHead className="text-right">Leads</TableHead>
                  <TableHead>Filters used</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {exports.data.rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap">{formatDateTime(r.at)}</TableCell>
                    <TableCell className="font-medium">{r.actorName ?? "—"}</TableCell>
                    <TableCell className="text-right">{Number((r.meta as { rowCount?: number } | null)?.rowCount ?? 0).toLocaleString()}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{describeFilters((r.meta as { filters?: unknown } | null)?.filters)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {exports.ok && exports.data.total > exports.data.rows.length && (
          <p className="text-xs text-muted-foreground">
            Showing the latest {exports.data.rows.length} of {exports.data.total.toLocaleString()} exports. Filter the log below by &quot;Exported leads&quot; to page through the rest.
          </p>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Everything</h2>
        {!log.ok ? (
          <ErrorState message={log.error} />
        ) : (
          <DataTable
            columns={columns}
            rows={log.data.rows}
            total={log.data.total}
            page={page}
            pageSize={PAGE_SIZE}
            searchParams={sp}
            rowHref={() => "#"}
            itemLabel="entries"
            emptyTitle="No entries match"
            emptyHint="Clear a filter, or widen the date range."
            toolbar={<AuditFilters actors={actors} />}
          />
        )}
        <p className="text-xs text-muted-foreground">
          List views are never logged (they would swamp the table). Opening a lead, editing it, assigning, importing, exporting, signing in and every user or territory change are.
        </p>
      </section>
    </div>
  );
}
