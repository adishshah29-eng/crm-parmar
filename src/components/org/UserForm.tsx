"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { createUser, updateUser } from "@/actions/org";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CREATABLE_ROLES,
  PARENT_ROLES,
  ROLE_LABEL,
  createUserSchema,
  updateUserSchema,
  type CreateUserInput,
  type UpdateUserInput,
} from "@/lib/schemas/user";
import type { UserRole } from "@/types/action";

// Create and edit share one form. The zod schemas are the SAME ones the server actions import,
// so the parent rules live in one place (lib/schemas/user.ts).

export type ParentOption = { id: string; fullName: string; role: UserRole };

const selectCls =
  "h-9 w-full rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

type EditUser = {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  role: UserRole;
  parentId: string | null;
};

type Props = { mode: "create"; parents: ParentOption[] } | { mode: "edit"; user: EditUser; parents: ParentOption[] };

export function UserForm(props: Props) {
  return props.mode === "create" ? <CreateForm parents={props.parents} /> : <EditForm user={props.user} parents={props.parents} />;
}

function Field({ label, htmlFor, error, hint, children }: { label: string; htmlFor: string; error?: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

function ParentSelect({ id, options, error, ...rest }: { id: string; options: ParentOption[]; error?: string } & React.ComponentProps<"select">) {
  return (
    <>
      <select id={id} className={selectCls} aria-invalid={!!error} {...rest}>
        <option value="">Choose…</option>
        {options.map((p) => (
          <option key={p.id} value={p.id}>
            {p.fullName} · {ROLE_LABEL[p.role]}
          </option>
        ))}
      </select>
      {options.length === 0 && (
        <p className="text-xs text-muted-foreground">Nobody active can be picked for this role yet.</p>
      )}
    </>
  );
}

// ---------------------------------------------------------------- create

function CreateForm({ parents }: { parents: ParentOption[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string>();

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors },
  } = useForm<CreateUserInput>({
    resolver: zodResolver(createUserSchema),
    defaultValues: { fullName: "", email: "", password: "", parentId: "" },
  });

  const role = useWatch({ control, name: "role" });
  const allowed = role ? parents.filter((p) => PARENT_ROLES[role].includes(p.role)) : [];

  const onSubmit = (values: CreateUserInput) => {
    setServerError(undefined);
    startTransition(async () => {
      const result = await createUser(values);
      if (!result.ok) return setServerError(result.error);
      toast.success(`${values.fullName} can now sign in`);
      router.push("/users");
      router.refresh();
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="max-w-lg space-y-4" noValidate>
      {serverError && (
        <Alert variant="destructive">
          <AlertDescription>{serverError}</AlertDescription>
        </Alert>
      )}
      <Field label="Full name" htmlFor="fullName" error={errors.fullName?.message}>
        <Input id="fullName" autoComplete="off" {...register("fullName")} />
      </Field>
      <Field label="Email" htmlFor="email" error={errors.email?.message} hint="They sign in with this.">
        <Input id="email" type="email" autoComplete="off" {...register("email")} />
      </Field>
      <Field label="Temporary password" htmlFor="password" error={errors.password?.message} hint="At least 8 characters. Give it to them privately; never in the repo or a group chat.">
        <Input id="password" type="text" autoComplete="new-password" {...register("password")} />
      </Field>
      <Field label="Role" htmlFor="role" error={errors.role?.message}>
        <select
          id="role"
          className={selectCls}
          aria-invalid={!!errors.role}
          {...register("role", { onChange: () => setValue("parentId", "") })}
          defaultValue=""
        >
          <option value="">Choose…</option>
          {CREATABLE_ROLES.map((r) => (
            <option key={r} value={r}>{ROLE_LABEL[r]}</option>
          ))}
        </select>
      </Field>
      <Field
        label="Reports to"
        htmlFor="parentId"
        error={errors.parentId?.message}
        hint={role ? `A ${ROLE_LABEL[role]} reports to a ${PARENT_ROLES[role].map((r) => ROLE_LABEL[r]).join(" or ")}.` : "Pick a role first."}
      >
        <ParentSelect id="parentId" options={allowed} error={errors.parentId?.message} disabled={!role} {...register("parentId")} />
      </Field>
      <Button type="submit" disabled={pending}>
        {pending ? "Creating…" : "Create user"}
      </Button>
    </form>
  );
}

// ---------------------------------------------------------------- edit

function EditForm({ user, parents }: { user: EditUser; parents: ParentOption[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string>();
  const isSuper = user.role === "super_admin";

  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<UpdateUserInput>({
    resolver: zodResolver(updateUserSchema),
    defaultValues: { userId: user.id, fullName: user.fullName, phone: user.phone ?? "", parentId: user.parentId },
  });

  // Never offer the person themselves; the rest is narrowed by the role rule.
  const allowed = parents.filter((p) => p.id !== user.id && PARENT_ROLES[user.role].includes(p.role));

  const onSubmit = (values: UpdateUserInput) => {
    setServerError(undefined);
    startTransition(async () => {
      const result = await updateUser(values);
      if (!result.ok) return setServerError(result.error);
      toast.success("Saved");
      router.refresh();
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="max-w-lg space-y-4" noValidate>
      {serverError && (
        <Alert variant="destructive">
          <AlertDescription>{serverError}</AlertDescription>
        </Alert>
      )}
      <Field label="Full name" htmlFor="fullName" error={errors.fullName?.message}>
        <Input id="fullName" autoComplete="off" {...register("fullName")} />
      </Field>
      <Field label="Email" htmlFor="email" hint="Email and role cannot be changed here.">
        <Input id="email" value={user.email} disabled readOnly />
      </Field>
      <Field label="Role" htmlFor="role">
        <Input id="role" value={ROLE_LABEL[user.role]} disabled readOnly />
      </Field>
      <Field label="Phone" htmlFor="phone" error={errors.phone?.message} hint="Optional. Stored as +91 98765 43210.">
        <Input id="phone" type="tel" inputMode="tel" autoComplete="off" {...register("phone")} />
      </Field>
      {!isSuper && (
        <Field label="Reports to" htmlFor="parentId" error={errors.parentId?.message}>
          <ParentSelect id="parentId" options={allowed} error={errors.parentId?.message} {...register("parentId")} />
        </Field>
      )}
      <Button type="submit" disabled={pending || !isDirty}>
        {pending ? "Saving…" : "Save changes"}
      </Button>
    </form>
  );
}
