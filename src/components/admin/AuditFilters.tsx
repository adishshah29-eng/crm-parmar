"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AUDIT_ACTIONS } from "@/lib/audit";
import { actionLabel } from "@/lib/audit-log/labels";

const selectCls =
  "h-8 pointer-coarse:h-11 pointer-coarse:text-base rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/** Actor, action and date filters for the audit log. Edits the URL only; the server page re-renders. */
export function AuditFilters({ actors }: { actors: { id: string; name: string }[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, startTransition] = useTransition();
  const val = (k: string) => sp.get(k) ?? "";

  const set = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    next.delete("page");
    startTransition(() => router.replace(`${pathname}${next.size ? `?${next}` : ""}`));
  };
  const active = ["actor", "action", "from", "to"].some((k) => sp.get(k));

  return (
    <div className="flex flex-wrap items-center gap-2" aria-busy={pending}>
      <select aria-label="Who" className={selectCls} value={val("actor")} onChange={(e) => set({ actor: e.target.value || undefined })}>
        <option value="">Anyone</option>
        {actors.map((a) => (
          <option key={a.id} value={a.id}>{a.name}</option>
        ))}
      </select>
      <select aria-label="What" className={selectCls} value={val("action")} onChange={(e) => set({ action: e.target.value || undefined })}>
        <option value="">Any action</option>
        {AUDIT_ACTIONS.map((a) => (
          <option key={a} value={a}>{actionLabel(a)}</option>
        ))}
      </select>
      <label className="flex items-center gap-1 text-sm text-muted-foreground">
        From
        <input type="date" aria-label="From date" className={selectCls} value={val("from")} onChange={(e) => set({ from: e.target.value || undefined })} />
      </label>
      <label className="flex items-center gap-1 text-sm text-muted-foreground">
        To
        <input type="date" aria-label="To date" className={selectCls} value={val("to")} onChange={(e) => set({ to: e.target.value || undefined })} />
      </label>
      {active && (
        <Button variant="ghost" size="sm" onClick={() => startTransition(() => router.replace(pathname))}>
          <X /> Clear
        </Button>
      )}
    </div>
  );
}
