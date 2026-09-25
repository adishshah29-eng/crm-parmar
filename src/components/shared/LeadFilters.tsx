"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useTransition, type FormEvent } from "react";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CALL_STATUSES, PIPELINE_STAGES, TEMPERATURES } from "@/lib/schemas/lead";
import { CALL_STATUS_LABEL, STAGE_LABEL, TEMPERATURE_LABEL } from "@/lib/leads/labels";
import { cn } from "@/lib/utils";

/**
 * The filter bar for any lead table. It only edits the URL; the server page re-renders with
 * the new params. It filters what the user CHOSE to look at — permission is RLS's job, so
 * nothing here is role-aware except whether to offer the owner control.
 */
type Props = {
  projects: { id: string; name: string }[];
  /** Offer "My leads / My team". For managers, sub_managers and admins. */
  showOwnerScope?: boolean;
  /** Offer "Unassigned" (leads nobody owns yet). For whoever assigns leads. */
  showUnassigned?: boolean;
  /** Offer a specific person as the owner filter. Only pass people this user may see. */
  owners?: { id: string; name: string }[];
  /** Offer a source filter (meta, 99acres, …). */
  sources?: { code: string; name: string }[];
  /** Offer a received-from / received-to date range. */
  showDates?: boolean;
  className?: string;
};

const selectCls =
  "h-8 pointer-coarse:h-11 pointer-coarse:text-base rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export function LeadFilters({ projects, showOwnerScope = false, showUnassigned = false, owners, sources, showDates = false, className }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, startTransition] = useTransition();

  const set = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    next.delete("page"); // any filter change goes back to page 1
    startTransition(() => router.replace(`${pathname}${next.size ? `?${next}` : ""}`));
  };

  const onSearch = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const q = new FormData(e.currentTarget).get("q");
    set({ q: typeof q === "string" ? q.trim() || undefined : undefined });
  };

  const active = ["q", "status", "temp", "stage", "project", "owner", "source", "from", "to", "sla", "untouched"].some((k) => sp.get(k));
  const val = (k: string) => sp.get(k) ?? "";

  return (
    <div className={cn("space-y-2", pending && "opacity-70 transition-opacity", className)} aria-busy={pending}>
      <form onSubmit={onSearch} className="flex gap-2">
        <div className="relative max-w-md flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            key={sp.get("q") ?? ""}
            name="q"
            defaultValue={sp.get("q") ?? ""}
            placeholder="Search name or part of a phone number"
            className="pl-8"
            inputMode="search"
            aria-label="Search leads"
          />
        </div>
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </form>

      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Call status" className={selectCls} value={val("status")} onChange={(e) => set({ status: e.target.value || undefined })}>
          <option value="">Any status</option>
          {CALL_STATUSES.map((s) => (
            <option key={s} value={s}>{CALL_STATUS_LABEL[s]}</option>
          ))}
        </select>

        <select aria-label="Temperature" className={selectCls} value={val("temp")} onChange={(e) => set({ temp: e.target.value || undefined })}>
          <option value="">Any temperature</option>
          {TEMPERATURES.map((t) => (
            <option key={t} value={t}>{TEMPERATURE_LABEL[t]}</option>
          ))}
        </select>

        <select aria-label="Pipeline stage" className={selectCls} value={val("stage")} onChange={(e) => set({ stage: e.target.value || undefined })}>
          <option value="">Any stage</option>
          {PIPELINE_STAGES.map((s) => (
            <option key={s} value={s}>{STAGE_LABEL[s]}</option>
          ))}
        </select>

        <select aria-label="Project" className={selectCls} value={val("project")} onChange={(e) => set({ project: e.target.value || undefined })}>
          <option value="">Any project</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>

        {(showOwnerScope || showUnassigned || (owners && owners.length > 0)) && (
          <select aria-label="Whose leads" className={selectCls} value={val("owner")} onChange={(e) => set({ owner: e.target.value || undefined })}>
            <option value="">Everything I can see</option>
            {showOwnerScope && <option value="me">My leads</option>}
            {showOwnerScope && <option value="team">My team&apos;s leads</option>}
            {showUnassigned && <option value="none">Unassigned</option>}
            {owners && owners.length > 0 && (
              <optgroup label="Owner">
                {owners.map((o) => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </optgroup>
            )}
          </select>
        )}

        {sources && sources.length > 0 && (
          <select aria-label="Source" className={selectCls} value={val("source")} onChange={(e) => set({ source: e.target.value || undefined })}>
            <option value="">Any source</option>
            {sources.map((s) => (
              <option key={s.code} value={s.code}>{s.name}</option>
            ))}
          </select>
        )}

        {showDates && (
          <>
            <label className="flex items-center gap-1 text-sm text-muted-foreground">
              From
              <input type="date" aria-label="Received from" className={selectCls} value={val("from")} onChange={(e) => set({ from: e.target.value || undefined })} />
            </label>
            <label className="flex items-center gap-1 text-sm text-muted-foreground">
              To
              <input type="date" aria-label="Received to" className={selectCls} value={val("to")} onChange={(e) => set({ to: e.target.value || undefined })} />
            </label>
          </>
        )}

        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" checked={val("untouched") === "1"} onChange={(e) => set({ untouched: e.target.checked ? "1" : undefined })} />
          Untouched
        </label>
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" checked={val("sla") === "1"} onChange={(e) => set({ sla: e.target.checked ? "1" : undefined })} />
          SLA breached
        </label>

        {active && (
          <Button variant="ghost" size="sm" onClick={() => startTransition(() => router.replace(pathname))}>
            <X /> Clear
          </Button>
        )}
      </div>
    </div>
  );
}
