import { redirect } from "next/navigation";
import { getDashboard } from "@/actions/dashboard";
import { EnginePanel } from "@/components/dashboard/EnginePanel";
import { PortfolioTable } from "@/components/dashboard/PortfolioTable";
import { RangeToggle } from "@/components/dashboard/RangeToggle";
import { StatCard } from "@/components/dashboard/StatCard";
import { ErrorState } from "@/components/shared/states";
import { requireUser } from "@/lib/auth";
import type { DashboardRange } from "@/lib/dashboard/queries";
import { can } from "@/lib/permissions";

export const metadata = { title: "Dashboard · Parmar CRM" };

// Company dashboard (D1.1-D1.3, D2.3, D2.4). Same page for every role that has one; the numbers
// are counted in SQL as the signed-in user, so RLS decides the scope: an admin sees the company, a
// manager their territory and team. A caller has no dashboard and lands on My Day.
export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const user = await requireUser();
  if (user.role === "caller") redirect("/my-day");

  const sp = await searchParams;
  const range: DashboardRange = sp.range === "all" ? "all" : "today";

  const result = await getDashboard({ range });
  const isAdmin = can.viewAllLeads(user.role);
  // Managers have no lead list to open yet (their portal is built separately); admins do.
  const listHref = isAdmin ? "/leads" : undefined;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">{isAdmin ? "The whole company" : "Your territory and team"}</p>
        </div>
        <RangeToggle range={range} />
      </div>

      {!result.ok ? (
        <ErrorState message={result.error} />
      ) : (
        <>
          <section aria-label="Headline numbers" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label={range === "today" ? "Leads received today" : "Total leads"}
              value={result.data.totalLeads}
              hint={range === "today" ? "Switch to All time for the whole book" : undefined}
              href={listHref}
            />
            <StatCard
              label="Untouched right now"
              value={result.data.untouchedLeads}
              tone="attention"
              hint={
                result.data.untouchedUnassigned > 0
                  ? `${result.data.untouchedUnassigned.toLocaleString("en-IN")} not assigned yet`
                  : "Nobody has called them yet"
              }
              href={listHref ? `${listHref}?untouched=1` : undefined}
            />
            <StatCard
              label="Escalations today"
              value={result.data.slaBreaches}
              tone="breach"
              hint="Live leads left 45 working minutes"
              href={listHref ? `${listHref}?sla=1` : undefined}
            />
            <StatCard label="Site visits this week" value={result.data.siteVisitsThisWeek} hint="Scheduled Monday to Sunday, not cancelled" />
          </section>

          {isAdmin && <EnginePanel engine={result.data.engine} leadsHref={listHref} />}

          <section className="space-y-2" aria-labelledby="portfolio-heading">
            <div className="flex flex-wrap items-baseline gap-x-3">
              <h2 id="portfolio-heading" className="text-lg font-semibold">
                Working portfolio
              </h2>
              <span className="text-sm text-muted-foreground">
                Each manager&apos;s own leads plus their team&apos;s · {range === "today" ? "received today" : "all time"}
              </span>
            </div>
            <PortfolioTable
              portfolios={result.data.managerPortfolios}
              rangeLabel={range === "today" ? "Received today" : "Leads"}
              leadsHref={listHref ? (id) => `${listHref}?owner=team:${id}` : undefined}
            />
          </section>
        </>
      )}
    </div>
  );
}
