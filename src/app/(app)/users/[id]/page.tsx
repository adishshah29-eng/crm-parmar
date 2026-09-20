import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PasswordActions } from "@/components/org/PasswordActions";
import { UserForm } from "@/components/org/UserForm";
import { UserStatusActions } from "@/components/org/UserStatusActions";
import { ErrorState, NoAccess } from "@/components/shared/states";
import { requireUser } from "@/lib/auth";
import { queryActiveUsers, queryUser } from "@/lib/org/queries";
import { can } from "@/lib/permissions";
import { createServerClient } from "@/lib/supabase/server";

export const metadata = { title: "Edit user · Parmar CRM" };

// Task A1.3: edit, deactivate, reactivate.
export default async function EditUserPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireUser();
  if (!can.manageUsers(me.role)) return <NoAccess message="User management is not available for your role." />;

  const { id } = await params;
  const supabase = await createServerClient();
  const [user, active] = await Promise.all([queryUser(supabase, id), queryActiveUsers(supabase)]);

  if (!user.ok) return <ErrorState title="User not found" message={user.error} />;
  if (!active.ok) return <ErrorState message={active.error} />;
  const u = user.data;

  const canDeactivate = u.role !== "super_admin" && u.id !== me.id;

  return (
    <div className="space-y-6">
      <Link href="/users" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Back to users
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold tracking-tight">{u.fullName}</h1>
        <Badge variant="outline">{u.isActive ? "Active" : "Deactivated"}</Badge>
      </div>

      <UserForm
        mode="edit"
        user={{ id: u.id, fullName: u.fullName, email: u.email, phone: u.phone, role: u.role, parentId: u.parentId }}
        parents={active.data}
      />

      {u.isActive && u.id !== me.id && <PasswordActions userId={u.id} fullName={u.fullName} />}

      {canDeactivate && (
        <UserStatusActions
          user={{ id: u.id, fullName: u.fullName, role: u.role, parentId: u.parentId, phone: u.phone }}
          isActive={u.isActive}
          candidates={active.data}
        />
      )}
    </div>
  );
}
