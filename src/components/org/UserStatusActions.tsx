"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { deactivateUser, getDeactivationPreview, updateUser } from "@/actions/org";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ROLE_LABEL, type DeactivationPreview } from "@/lib/schemas/user";
import type { UserRole } from "@/types/action";
import type { ParentOption } from "@/components/org/UserForm";

const selectCls =
  "h-9 w-full rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

type Target = { id: string; fullName: string; role: UserRole; parentId: string | null; phone: string | null };

/**
 * Deactivate and reactivate. Deactivating shows the open-lead count FIRST and where the leads will
 * go under the automatic territory rule (A1.3, A2.4). The super admin may name one person instead.
 * Nothing is deleted, ever.
 */
export function UserStatusActions({ user, isActive, candidates }: { user: Target; isActive: boolean; candidates: ParentOption[] }) {
  return isActive ? <DeactivatePanel user={user} candidates={candidates} /> : <ReactivateButton user={user} />;
}

function DeactivatePanel({ user, candidates }: { user: Target; candidates: ParentOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<DeactivationPreview>();
  const [transferTo, setTransferTo] = useState("");
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const begin = () => {
    setOpen(true);
    setError(undefined);
    startTransition(async () => {
      const r = await getDeactivationPreview(user.id);
      if (r.ok) setPreview(r.data);
      else setError(r.error);
    });
  };

  const confirm = () => {
    setError(undefined);
    startTransition(async () => {
      const r = await deactivateUser({ userId: user.id, transferTo: transferTo || undefined });
      if (!r.ok) return setError(r.error);
      toast.success(
        r.data.transferred > 0
          ? `${user.fullName} deactivated. ${r.data.transferred} ${r.data.transferred === 1 ? "lead" : "leads"} moved.`
          : `${user.fullName} deactivated.`,
      );
      router.push("/users");
      router.refresh();
    });
  };

  if (!open) {
    return (
      <Button variant="destructive" onClick={begin}>
        Deactivate user…
      </Button>
    );
  }

  const targets = candidates.filter((c) => c.id !== user.id);
  const hasLeads = (preview?.openLeads ?? 0) > 0;
  const blocked = (preview?.activeReports ?? 0) > 0;
  // The automatic rule places every lead unless it reports a problem; then a named person is needed.
  const needsNamedPerson = hasLeads && !!preview?.planError;
  const canConfirm = !!preview && !blocked && (!needsNamedPerson || !!transferTo) && !pending;

  return (
    <section className="max-w-lg space-y-3 rounded-lg border border-destructive/40 p-4" aria-label="Deactivate user">
      <h2 className="font-semibold">Deactivate {user.fullName}</h2>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {!preview && !error && <p className="text-sm text-muted-foreground">Checking their leads and team…</p>}

      {preview && (
        <>
          <p className="text-sm">
            They have <strong>{preview.openLeads}</strong> open {preview.openLeads === 1 ? "lead" : "leads"} and{" "}
            <strong>{preview.activeReports}</strong> active {preview.activeReports === 1 ? "person" : "people"} reporting to them.
          </p>
          {blocked && (
            <Alert variant="destructive">
              <AlertDescription>
                Move the {preview.activeReports} {preview.activeReports === 1 ? "person" : "people"} who report to {user.fullName} to someone
                else first (edit each person), then come back. Otherwise their leads would stop being routed.
              </AlertDescription>
            </Alert>
          )}
          {hasLeads && !blocked && (
            <div className="space-y-3">
              {preview.planError ? (
                <Alert variant="destructive">
                  <AlertDescription>{preview.planError}</AlertDescription>
                </Alert>
              ) : (
                !transferTo && (
                  <div className="rounded-md bg-muted p-3 text-sm">
                    <p className="font-medium">Where the open leads will go</p>
                    <p className="mb-1 text-xs text-muted-foreground">
                      Each lead goes to the manager whose territory covers it. If managers share it, leads are spread evenly.
                      If nobody covers it, it goes to their nearest manager above.
                    </p>
                    <ul className="space-y-0.5">
                      {preview.receivers.map((r) => (
                        <li key={r.userId}>
                          <strong>{r.count}</strong> → {r.fullName}
                          {r.fallback && <span className="text-xs text-muted-foreground"> (nobody covers these; their manager above)</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )
              )}
              <div className="space-y-1.5">
                <Label htmlFor="transferTo">
                  {preview.planError ? "Who takes them?" : "Or send all of them to one person instead (optional)"}
                </Label>
                <select id="transferTo" className={selectCls} value={transferTo} onChange={(e) => setTransferTo(e.target.value)}>
                  <option value="">{preview.planError ? "Choose…" : "Use the automatic rule"}</option>
                  {targets.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.fullName} · {ROLE_LABEL[c.role]}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  Each move is recorded in the lead&apos;s ownership history as an exit transfer, and the new owner is notified. Their sign-in is revoked at once; nothing is deleted.
                </p>
              </div>
            </div>
          )}
        </>
      )}

      <div className="flex gap-2">
        <Button variant="destructive" disabled={!canConfirm} onClick={confirm}>
          {pending ? "Working…" : hasLeads ? `Transfer ${preview?.openLeads} & deactivate` : "Deactivate"}
        </Button>
        <Button variant="ghost" disabled={pending} onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </section>
  );
}

function ReactivateButton({ user }: { user: Target }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  return (
    <div className="max-w-lg space-y-2">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <p className="text-sm text-muted-foreground">
        {user.fullName} is deactivated and cannot sign in. Their old leads stay where they were moved.
      </p>
      <Button
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(undefined);
            const r = await updateUser({ userId: user.id, fullName: user.fullName, phone: user.phone ?? "", parentId: user.parentId, isActive: true });
            if (!r.ok) return setError(r.error);
            toast.success(`${user.fullName} is active again`);
            router.refresh();
          })
        }
      >
        {pending ? "Reactivating…" : "Reactivate user"}
      </Button>
    </div>
  );
}
