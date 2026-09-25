import Link from "next/link";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { EmptyState } from "@/components/shared/states";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ManagerPortfolio } from "@/lib/dashboard/queries";
import { PIPELINE_STAGES } from "@/lib/schemas/lead";

const n = (v: number) => v.toLocaleString("en-IN");

/**
 * The working portfolio of every manager the viewer may see: a row each, with the lead count split
 * by pipeline stage. A portfolio is the manager's own leads plus everyone below them (not their
 * territory, which two managers can share and would count twice). `leadsHref` makes the name a link
 * to that manager's leads; omit it for roles that have no list to open yet.
 */
export function PortfolioTable({
  portfolios,
  rangeLabel,
  leadsHref,
}: {
  portfolios: ManagerPortfolio[];
  rangeLabel: string;
  leadsHref?: (managerId: string) => string;
}) {
  if (portfolios.length === 0) {
    return <EmptyState title="No managers to show" hint="Managers appear here once they exist. Create one on the Users page, then give them a territory." />;
  }
  return (
    <div className="overflow-auto rounded-2xl bg-card p-2 shadow-sm">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Manager</TableHead>
            <TableHead className="text-right">{rangeLabel}</TableHead>
            <TableHead>By stage</TableHead>
            <TableHead className="hidden text-right sm:table-cell">Untouched</TableHead>
            <TableHead className="hidden text-right md:table-cell">Callers</TableHead>
            <TableHead className="hidden text-right md:table-cell">Visits booked</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {portfolios.map((p) => (
            <TableRow key={p.managerId}>
              <TableCell className="font-medium">
                <span className="flex items-center gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent text-xs font-semibold text-accent-foreground" aria-hidden>
                    {p.name
                      .split(/\s+/)
                      .filter(Boolean)
                      .slice(0, 2)
                      .map((w) => w[0]!.toUpperCase())
                      .join("")}
                  </span>
                  {leadsHref ? (
                    <Link href={leadsHref(p.managerId)} className="underline-offset-2 hover:underline">
                      {p.name}
                    </Link>
                  ) : (
                    p.name
                  )}
                </span>
              </TableCell>
              <TableCell className="text-right tabular-nums">{n(p.leadCount)}</TableCell>
              <TableCell>
                {p.leadCount === 0 ? (
                  <span className="text-muted-foreground">—</span>
                ) : (
                  <span className="flex flex-wrap gap-1">
                    {PIPELINE_STAGES.filter((s) => p.byStage[s] > 0).map((s) => (
                      <span key={s} className="inline-flex items-center gap-1">
                        <StatusBadge kind="pipeline_stage" value={s} />
                        <span className="text-xs tabular-nums text-muted-foreground">{n(p.byStage[s])}</span>
                      </span>
                    ))}
                  </span>
                )}
              </TableCell>
              <TableCell className="hidden text-right tabular-nums sm:table-cell">{n(p.untouched)}</TableCell>
              <TableCell className="hidden text-right tabular-nums md:table-cell">{n(p.callers)}</TableCell>
              <TableCell className="hidden text-right tabular-nums md:table-cell">{n(p.visitsBooked)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
