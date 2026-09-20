"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { reassign } from "@/actions/assignment";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ROLE_LABEL } from "@/lib/schemas/user";
import type { Assignee } from "@/components/admin/AssignLeadsBar";

const selectCls =
  "h-9 w-full rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/** Assign or reassign ONE lead, from its detail page. Admin only. */
export function AssignLeadPanel({
  leadId,
  currentOwnerId,
  currentOwnerName,
  assignees,
}: {
  leadId: string;
  currentOwnerId: string | null;
  currentOwnerName: string | null;
  assignees: Assignee[];
}) {
  const router = useRouter();
  const [to, setTo] = useState("");
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const options = assignees.filter((a) => a.id !== currentOwnerId);

  return (
    <section className="space-y-3 rounded-lg border p-4" aria-label="Assign lead">
      <h2 className="font-semibold">{currentOwnerId ? "Reassign" : "Assign"}</h2>
      <p className="text-sm text-muted-foreground">
        {currentOwnerId ? `Owned by ${currentOwnerName ?? "someone outside your view"}.` : "Nobody owns this lead yet."}
      </p>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="assignTo">Give it to</Label>
        <select id="assignTo" className={selectCls} value={to} onChange={(e) => setTo(e.target.value)}>
          <option value="">Choose…</option>
          {options.map((a) => (
            <option key={a.id} value={a.id}>
              {a.fullName} · {ROLE_LABEL[a.role]}
            </option>
          ))}
        </select>
      </div>
      <Button
        disabled={!to || pending}
        onClick={() =>
          startTransition(async () => {
            setError(undefined);
            const r = await reassign({ leadId, toUserId: to });
            if (!r.ok) return setError(r.error);
            toast.success("Lead assigned");
            setTo("");
            router.refresh();
          })
        }
      >
        {pending ? "Assigning…" : currentOwnerId ? "Reassign" : "Assign"}
      </Button>
    </section>
  );
}
