"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { forcePasswordReset } from "@/actions/org";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Super admin: make someone choose a new password at their next sign-in (task A3.4). Optionally set
 * a temporary one first. That is the practical route when email is not configured: hand the person
 * the temporary password privately and they are forced to replace it.
 */
export function PasswordActions({ userId, fullName }: { userId: string; fullName: string }) {
  const [temp, setTemp] = useState("");
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  return (
    <section className="max-w-lg space-y-3 rounded-lg border p-4" aria-label="Password">
      <h2 className="font-semibold">Password</h2>
      <p className="text-sm text-muted-foreground">
        {fullName} can reset their own password from the sign-in page if email is set up. Otherwise, or if you need them to change it now,
        require a change here: they will be held on the change-password page at next sign-in until they choose a new one.
      </p>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="tempPassword">Temporary password (optional)</Label>
        <Input id="tempPassword" type="text" autoComplete="off" value={temp} onChange={(e) => setTemp(e.target.value)} placeholder="Leave empty to keep their current password" />
        <p className="text-xs text-muted-foreground">At least 8 characters. Give it to them privately, never in a group chat or the repo.</p>
      </div>
      <Button
        variant="outline"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(undefined);
            const r = await forcePasswordReset({ userId, temporaryPassword: temp });
            if (!r.ok) return setError(r.error);
            setTemp("");
            toast.success(r.data.temporary ? `${fullName}'s password was replaced and they must change it at next sign-in` : `${fullName} must choose a new password at next sign-in`);
          })
        }
      >
        {pending ? "Saving…" : "Require password change"}
      </Button>
    </section>
  );
}
