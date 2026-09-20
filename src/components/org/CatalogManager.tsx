"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createLocation, createProject, updateLocation, updateProject } from "@/actions/org";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Catalog } from "@/lib/org/territory";

// Projects and locations (task A2.2). Nothing here is hardcoded: the project list, the location
// list and the city suggestions all come from the database. Nothing can be deleted, because
// leads and history point at these rows; a project can be made inactive instead.

const selectCls =
  "h-9 w-full rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export function CatalogManager({ catalog, cities, leadCounts }: { catalog: Catalog; cities: string[]; leadCounts: Record<string, number> }) {
  const listId = useId();
  const byLocation = (id: string) => catalog.projects.filter((p) => p.locationId === id);

  return (
    <div className="space-y-8">
      {/* suggestions for the city field, taken from the cities that already exist */}
      <datalist id={listId}>
        {cities.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Locations</h2>
        <LocationForm mode="create" cityListId={listId} />
        <div className="space-y-2">
          {catalog.locations.length === 0 && <p className="text-sm text-muted-foreground">No locations yet. Add the first one above.</p>}
          {catalog.locations.map((l) => (
            <LocationForm key={`${l.id}-${l.name}-${l.city}`} mode="edit" cityListId={listId} location={l} projectCount={byLocation(l.id).length} />
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Projects</h2>
        {catalog.locations.length === 0 ? (
          <p className="text-sm text-muted-foreground">Add a location first. Every project belongs to one.</p>
        ) : (
          <ProjectForm mode="create" catalog={catalog} />
        )}
        <div className="space-y-2">
          {catalog.projects.length === 0 && <p className="text-sm text-muted-foreground">No projects yet.</p>}
          {catalog.projects.map((p) => (
            <ProjectForm key={`${p.id}-${p.name}-${p.locationId}-${p.developer}-${p.isActive}`} mode="edit" catalog={catalog} project={p} leadCount={leadCounts[p.id] ?? 0} />
          ))}
        </div>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------- location

function LocationForm(
  props:
    | { mode: "create"; cityListId: string }
    | { mode: "edit"; cityListId: string; location: Catalog["locations"][number]; projectCount: number },
) {
  const router = useRouter();
  const editing = props.mode === "edit";
  const initial = editing ? props.location : { id: "", name: "", city: "" };
  const [name, setName] = useState(initial.name);
  const [city, setCity] = useState(initial.city);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const dirty = name.trim() !== initial.name || city.trim() !== initial.city;

  const submit = () =>
    startTransition(async () => {
      setError(undefined);
      const r = editing
        ? await updateLocation({ locationId: props.location.id, name, city })
        : await createLocation({ name, city });
      if (!r.ok) return setError(r.error);
      toast.success(editing ? "Location saved" : `${name.trim()} added`);
      if (!editing) {
        setName("");
        setCity("");
      }
      router.refresh();
    });

  return (
    <form
      className="space-y-2 rounded-lg border p-3"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <label className="grid gap-1 text-xs text-muted-foreground">
          Location
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Worli" className="w-48" aria-label="Location name" />
        </label>
        <label className="grid gap-1 text-xs text-muted-foreground">
          City
          <Input value={city} onChange={(e) => setCity(e.target.value)} list={props.cityListId} placeholder="e.g. Mumbai" className="w-40" aria-label="City" autoComplete="off" />
        </label>
        <Button type="submit" disabled={pending || (editing ? !dirty : !name.trim() || !city.trim())}>
          {pending ? "Saving…" : editing ? "Save" : "Add location"}
        </Button>
        {editing && <span className="pb-2 text-xs text-muted-foreground">{props.projectCount} {props.projectCount === 1 ? "project" : "projects"}</span>}
      </div>
    </form>
  );
}

// ---------------------------------------------------------------- project

function ProjectForm(
  props:
    | { mode: "create"; catalog: Catalog }
    | { mode: "edit"; catalog: Catalog; project: Catalog["projects"][number]; leadCount: number },
) {
  const router = useRouter();
  const editing = props.mode === "edit";
  const initial = editing ? props.project : { id: "", name: "", locationId: "", developer: null as string | null, isActive: true };
  const [name, setName] = useState(initial.name);
  const [locationId, setLocationId] = useState(initial.locationId);
  const [developer, setDeveloper] = useState(initial.developer ?? "");
  const [isActive, setIsActive] = useState(initial.isActive);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const dirty =
    name.trim() !== initial.name ||
    locationId !== initial.locationId ||
    developer.trim() !== (initial.developer ?? "") ||
    isActive !== initial.isActive;
  const moving = editing && locationId !== initial.locationId;
  const cities = [...new Set(props.catalog.locations.map((l) => l.city))].sort();

  const submit = () =>
    startTransition(async () => {
      setError(undefined);
      const r = editing
        ? await updateProject({ projectId: props.project.id, name, locationId, developer, isActive })
        : await createProject({ name, locationId, developer });
      if (!r.ok) return setError(r.error);
      toast.success(editing ? "Project saved" : `${name.trim()} added`);
      if (!editing) {
        setName("");
        setLocationId("");
        setDeveloper("");
      }
      router.refresh();
    });

  return (
    <form
      className="space-y-2 rounded-lg border p-3"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <label className="grid gap-1 text-xs text-muted-foreground">
          Project
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Lodha Bellevue" className="w-56" aria-label="Project name" />
        </label>
        <label className="grid gap-1 text-xs text-muted-foreground">
          Location
          <select className={`${selectCls} w-48`} value={locationId} onChange={(e) => setLocationId(e.target.value)} aria-label="Location">
            <option value="">Choose…</option>
            {cities.map((c) => (
              <optgroup key={c} label={c}>
                {props.catalog.locations.filter((l) => l.city === c).map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs text-muted-foreground">
          Developer
          <Input value={developer} onChange={(e) => setDeveloper(e.target.value)} placeholder="optional" className="w-44" aria-label="Developer" />
        </label>
        {editing && (
          <label className="flex items-center gap-1.5 pb-2 text-sm">
            <input type="checkbox" className="size-4 accent-primary" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            Active
          </label>
        )}
        <Button type="submit" disabled={pending || (editing ? !dirty : !name.trim() || !locationId)}>
          {pending ? "Saving…" : editing ? "Save" : "Add project"}
        </Button>
        {editing && (
          <span className="flex items-center gap-2 pb-2 text-xs text-muted-foreground">
            {props.leadCount} {props.leadCount === 1 ? "lead" : "leads"}
            {!props.project.isActive && <Badge variant="outline">Inactive</Badge>}
          </span>
        )}
      </div>
      {moving && props.leadCount > 0 && (
        <p className="text-xs text-amber-800">
          Moving this project also moves its {props.leadCount} {props.leadCount === 1 ? "lead" : "leads"} to the new location, so territory visibility follows.
        </p>
      )}
      {editing && !isActive && props.project.isActive && (
        <p className="text-xs text-muted-foreground">Inactive projects drop out of filters. Existing leads stay where they are.</p>
      )}
    </form>
  );
}
