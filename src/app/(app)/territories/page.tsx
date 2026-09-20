import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, ErrorState, NoAccess } from "@/components/shared/states";
import { requireUser } from "@/lib/auth";
import { coveredProjectIds, projectCoverage, queryCatalog, queryManagerScopes } from "@/lib/org/territory";
import { can } from "@/lib/permissions";
import { createServerClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata = { title: "Territories · Parmar CRM" };

// Task A2.1 overview: who covers what, grouped by city, with gaps and overlaps visible at a glance.
export default async function TerritoriesPage() {
  const me = await requireUser();
  if (!can.editTerritories(me.role)) return <NoAccess message="Territories are not available for your role." />;

  const supabase = await createServerClient();
  const [catalog, managers] = await Promise.all([queryCatalog(supabase), queryManagerScopes(supabase)]);
  if (!catalog.ok) return <ErrorState message={catalog.error} />;
  if (!managers.ok) return <ErrorState message={managers.error} />;

  const coverage = projectCoverage(catalog.data, managers.data);
  const unmanaged = coverage.filter((c) => c.project.isActive && c.managers.length === 0);
  const shared = coverage.filter((c) => c.managers.length > 1);
  const cities = [...new Set(catalog.data.locations.map((l) => l.city))].sort();
  const locName = new Map(catalog.data.locations.map((l) => [l.id, l]));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">Territories</h1>
        <Link href="/territories/projects" className={buttonVariants({ variant: "outline" })}>
          Projects &amp; locations
        </Link>
      </div>

      <p className="text-sm text-muted-foreground">
        A territory is a project, a location, or both. Only managers hold one; sub-managers and callers inherit their manager&apos;s.
        Two managers can share a project or a location.
      </p>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Managers</h2>
        {managers.data.length === 0 ? (
          <EmptyState title="No managers yet" hint="Create a manager on the Users page, then give them a territory here." />
        ) : (
          <div className="overflow-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Manager</TableHead>
                  <TableHead className="text-right">Locations</TableHead>
                  <TableHead className="text-right">Projects named</TableHead>
                  <TableHead className="text-right">Projects covered</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {managers.data.map((m) => (
                  <TableRow key={m.userId} className={cn(!m.isActive && "opacity-50")}>
                    <TableCell className="font-medium">
                      {m.fullName} {!m.isActive && <Badge variant="outline">Deactivated</Badge>}
                    </TableCell>
                    <TableCell className="text-right">{m.locationIds.length}</TableCell>
                    <TableCell className="text-right">{m.projectIds.length}</TableCell>
                    <TableCell className="text-right">{coveredProjectIds(m, catalog.data).size}</TableCell>
                    <TableCell className="text-right">
                      {m.isActive && (
                        <Link href={`/territories/${m.userId}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                          Edit territory
                        </Link>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h2 className="text-lg font-semibold">Coverage</h2>
          <span className="text-sm text-muted-foreground">
            {coverage.length} {coverage.length === 1 ? "project" : "projects"} · {shared.length} shared · {unmanaged.length} with no manager
          </span>
        </div>

        {unmanaged.length > 0 && (
          <div role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
            <strong>No manager covers:</strong> {unmanaged.map((c) => c.project.name).join(", ")}. Leads there are visible to admins only
            until a manager is given the project or its location.
          </div>
        )}

        {cities.length === 0 ? (
          <EmptyState title="No projects yet" hint="Add locations and projects first." action={<Link href="/territories/projects" className={buttonVariants()}>Add them</Link>} />
        ) : (
          cities.map((city) => (
            <div key={city} className="space-y-1">
              <h3 className="text-sm font-semibold text-muted-foreground">{city}</h3>
              <div className="overflow-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Project</TableHead>
                      <TableHead className="hidden sm:table-cell">Location</TableHead>
                      <TableHead>Covered by</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {coverage
                      .filter((c) => locName.get(c.project.locationId)?.city === city)
                      .map((c) => (
                        <TableRow key={c.project.id} className={cn(!c.project.isActive && "opacity-50")}>
                          <TableCell className="font-medium">
                            {c.project.name} {!c.project.isActive && <Badge variant="outline">Inactive</Badge>}
                          </TableCell>
                          <TableCell className="hidden sm:table-cell">{locName.get(c.project.locationId)?.name}</TableCell>
                          <TableCell>
                            {c.managers.length === 0 ? (
                              <span className="text-amber-800">No manager</span>
                            ) : (
                              <span className="flex flex-wrap gap-1">
                                {c.managers.map((m) => (
                                  <Badge key={m.userId} variant="outline">{m.fullName}</Badge>
                                ))}
                                {c.managers.length > 1 && <span className="text-xs text-muted-foreground">shared</span>}
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
