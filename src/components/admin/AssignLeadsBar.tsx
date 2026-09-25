"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { bulkAssign } from "@/actions/assignment";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useSelection } from "@/components/shared/selection";
import { ROLE_LABEL } from "@/lib/schemas/user";
import type { UserRole } from "@/types/action";

const selectCls =
  "h-8 pointer-coarse:h-11 pointer-coarse:text-base min-w-48 rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export type Assignee = { id: string; fullName: string; role: UserRole };

/**
 * Bulk assign for the admin's all-leads table. Appears once rows are selected. Everything is one
 * database transaction (public.move_leads): ownership history, the new owner's notification, and
 * the 45-minute SLA restart for live leads. Rendered inside <SelectionProvider>.
 */
export function AssignLeadsBar({ assignees }: { assignees: Assignee[] }) {
  const router = useRouter();
  const sel = useSelection();
  const [to, setTo] = useState("");
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  if (sel.count === 0) return null;

  const submit = () =>
    startTransition(async () => {
      setError(undefined);
      const r = await bulkAssign({ leadIds: sel.ids, toUserId: to });
      if (!r.ok) return setError(r.error);
      const who = assignees.find((a) => a.id === to)?.fullName ?? "them";
      toast.success(
        r.data.skipped > 0
          ? `${r.data.moved} assigned to ${who}. ${r.data.skipped} already belonged to them.`
          : `${r.data.moved} ${r.data.moved === 1 ? "lead" : "leads"} assigned to ${who}.`,
      );
      sel.clear();
      setTo("");
      router.refresh();
    });

  return (
    <div className="sticky top-2 z-30 space-y-2 rounded-2xl bg-card p-3 shadow-md" role="region" aria-label="Assign selected leads">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">
          {sel.count} {sel.count === 1 ? "lead" : "leads"} selected
        </span>
        <select aria-label="Assign to" className={selectCls} value={to} onChange={(e) => setTo(e.target.value)}>
          <option value="">Assign to…</option>
          {assignees.map((a) => (
            <option key={a.id} value={a.id}>
              {a.fullName} · {ROLE_LABEL[a.role]}
            </option>
          ))}
        </select>
        <Button disabled={!to || pending} onClick={submit}>
          {pending ? "Assigning…" : "Assign"}
        </Button>
        <Button variant="ghost" disabled={pending} onClick={sel.clear}>
          Clear selection
        </Button>
        <span className="text-xs text-muted-foreground">Restarts the 45-minute clock on live leads and notifies the new owner.</span>
      </div>
    </div>
  );
}
