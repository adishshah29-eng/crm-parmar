import { StatCard } from "@/components/dashboard/StatCard";
import type { DashboardData } from "@/lib/dashboard/queries";

/**
 * The engine panel (D2.4): is the machinery that hands out leads keeping up? The night queue is
 * spelled out as "waiting for 10:30" so nobody reads those leads as lost. For admins.
 */
export function EnginePanel({ engine, leadsHref }: { engine: DashboardData["engine"]; leadsHref?: string }) {
  return (
    <section className="space-y-2" aria-labelledby="engine-heading">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <h2 id="engine-heading" className="text-lg font-semibold">
          Lead routing
        </h2>
        <span className="text-sm text-muted-foreground">Leads nobody owns yet</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Unassigned"
          value={engine.unassigned}
          tone="attention"
          href={leadsHref ? `${leadsHref}?owner=none` : undefined}
          hint="Not owned by anyone yet"
        />
        <StatCard
          label="Waiting for 10:30"
          value={engine.waitingFor1030}
          hint="Live leads. The 10:30 run assigns them, so they are waiting, not lost."
        />
        <StatCard
          label="Needs manual assignment"
          value={engine.needsManualAssignment}
          tone="attention"
          hint="Walk-ins and referrals. Nothing assigns these automatically."
        />
      </div>
    </section>
  );
}
