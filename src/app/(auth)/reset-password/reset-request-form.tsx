"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { requestPasswordReset } from "@/actions/auth";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resetRequestSchema } from "@/lib/schemas/auth";

type Values = { email: string };

export function ResetRequestForm() {
  const [pending, startTransition] = useTransition();
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string>();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(resetRequestSchema) });

  if (sent) {
    return (
      <Alert>
        <AlertDescription>
          If that email belongs to an account, a reset link is on its way. It works once and expires after a while. If nothing arrives in a few
          minutes, ask the super admin to set you a temporary password.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <form
      onSubmit={handleSubmit((v) =>
        startTransition(async () => {
          setError(undefined);
          const r = await requestPasswordReset(v.email);
          if (!r.ok) return setError(r.error);
          setSent(true);
        }),
      )}
      className="space-y-4"
      noValidate
    >
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" autoComplete="email" inputMode="email" {...register("email")} />
        {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
      </div>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Sending…" : "Send reset link"}
      </Button>
    </form>
  );
}
