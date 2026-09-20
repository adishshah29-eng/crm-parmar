"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Info } from "lucide-react";
import { toast } from "sonner";
import { setScopes } from "@/actions/org";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { computeOverlaps, type Catalog, type ManagerScopes } from "@/lib/org/territory";

/**
 * Assign projects and locations to ONE manager, grouped by city (task A2.1).
 *
 * Ticking a whole location covers every project in it, now and in future, so its projects show as
 * covered and are not stored separately. Overlap with other managers is ALLOWED by design (D-003):
 * it is shown as a warning that updates as you tick, and it never blocks Save. The warning only
 * makes the overlap deliberate.
 */
export function TerritoryEditor({
  manager,
  catalog,
  managers,
}: {
  manager: { id: string; fullName: string };
  catalog: Catalog;
  /** All managers, including this one (its saved scopes seed the form). */
  managers: ManagerScopes[];
}) {
  const router = useRouter();
  const saved = managers.find((m) => m.userId === manager.id);
  const [locations, setLocations] = useState<Set<string>>(new Set(saved?.locationIds ?? []));
  const [projects, setProjects] = useState<Set<string>>(new Set(saved?.projectIds ?? []));
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  // A project inside a ticked location is covered by it and is not stored on its own.
  const projectsToSave = useMemo(
    () => catalog.projects.filter((p) => projects.has(p.id) && !locations.has(p.locationId)).map((p) => p.id),
    [catalog.projects, projects, locations],
  );
  const locationsToSave = useMemo(() => [...locations], [locations]);

  const { overlaps } = useMemo(
    () => computeOverlaps({ managerId: manager.id, projectIds: projectsToSave, locationIds: locationsToSave, catalog, managers }),
    [manager.id, projectsToSave, locationsToSave, catalog, managers],
  );

  const coveredCount = useMemo(() => {
    const covered = new Set(projectsToSave);
    for (const p of catalog.projects) if (locations.has(p.locationId)) covered.add(p.id);
    return covered.size;
  }, [projectsToSave, catalog.projects, locations]);

  const changed = useMemo(() => {
    const a = new Set(saved?.projectIds ?? []);
    const b = new Set(saved?.locationIds ?? []);
    return (
      projectsToSave.length !== a.size ||
      projectsToSave.some((id) => !a.has(id)) ||
      locationsToSave.length !== b.size ||
      locationsToSave.some((id) => !b.has(id))
    );
  }, [saved, projectsToSave, locationsToSave]);

  const cities = useMemo(() => [...new Set(catalog.locations.map((l) => l.city))].sort(), [catalog.locations]);

  const toggle = (set: Set<string>, id: string, on: boolean) => {
    const next = new Set(set);
    if (on) next.add(id);
    else next.delete(id);
    return next;
  };

  const save = () =>
    startTransition(async () => {
      setError(undefined);
      const r = await setScopes({ userId: manager.id, projectIds: projectsToSave, locationIds: locationsToSave });
      if (!r.ok) return setError(r.error);
      toast.success(`${manager.fullName}'s territory saved`);
      router.refresh();
    });

  return (
    <div className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {overlaps.length > 0 && (
        <div role="status" className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
          <p className="flex items-center gap-2 font-medium">
            <AlertTriangle className="size-4" aria-hidden /> Overlap with other managers
          </p>
          <p className="text-xs">
            Sharing is allowed: each manager sees the leads in a shared territory, and new leads there are shared out between them.
            This is a heads-up, not an error.
          </p>
          <ul className="list-disc space-y-1 pl-5">
            {overlaps.map((o) => (
              <li key={`${o.kind}-${o.id}`}>
                <strong>{o.name}</strong>: {o.others.map((x) => `${x.fullName} ${x.via}`).join("; ")}
              </li>
            ))}
          </ul>
        </div>
      )}

      {cities.length === 0 && <p className="text-sm text-muted-foreground">No locations exist yet. Add them under Projects &amp; locations first.</p>}

      {cities.map((city) => (
        <fieldset key={city} className="space-y-3 rounded-lg border p-4">
          <legend className="px-1 text-sm font-semibold">{city}</legend>
          {catalog.locations
            .filter((l) => l.city === city)
            .map((loc) => {
              const inside = catalog.projects.filter((p) => p.locationId === loc.id);
              const wholeLocation = locations.has(loc.id);
              return (
                <div key={loc.id} className="space-y-1.5">
                  <label className="flex items-center gap-2 font-medium">
                    <input
                      type="checkbox"
                      className="size-4 accent-primary"
                      checked={wholeLocation}
                      onChange={(e) => setLocations((cur) => toggle(cur, loc.id, e.target.checked))}
                    />
                    {loc.name}
                    <span className="text-xs font-normal text-muted-foreground">whole location, including projects added later</span>
                  </label>
                  <ul className="ml-6 space-y-1">
                    {inside.length === 0 && <li className="text-xs text-muted-foreground">No projects in this location yet.</li>}
                    {inside.map((p) => (
                      <li key={p.id}>
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            className="size-4 accent-primary"
                            checked={wholeLocation || projects.has(p.id)}
                            disabled={wholeLocation}
                            onChange={(e) => setProjects((cur) => toggle(cur, p.id, e.target.checked))}
                          />
                          <span className={p.isActive ? "" : "text-muted-foreground"}>
                            {p.name}
                            {p.developer && <span className="text-xs text-muted-foreground"> · {p.developer}</span>}
                            {!p.isActive && <span className="text-xs"> (inactive)</span>}
                          </span>
                          {wholeLocation && <span className="text-xs text-muted-foreground">covered by the location</span>}
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
        </fieldset>
      ))}

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={save} disabled={pending || !changed}>
          {pending ? "Saving…" : "Save territory"}
        </Button>
        <span className="text-sm text-muted-foreground">
          {coveredCount} {coveredCount === 1 ? "project" : "projects"} covered{changed ? " · unsaved changes" : ""}
        </span>
      </div>

      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        Takes effect straight away for who sees which leads and for routing new leads. Leads that already have an owner do not move.
        Sub-managers and callers under {manager.fullName} inherit this territory automatically.
      </p>
    </div>
  );
}
