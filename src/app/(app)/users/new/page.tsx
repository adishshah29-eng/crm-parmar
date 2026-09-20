import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { UserForm } from "@/components/org/UserForm";
import { ErrorState, NoAccess } from "@/components/shared/states";
import { requireUser } from "@/lib/auth";
import { queryActiveUsers } from "@/lib/org/queries";
import { can } from "@/lib/permissions";
import { createServerClient } from "@/lib/supabase/server";

export const metadata = { title: "Create user · Parmar CRM" };

// Task A1.2.
export default async function NewUserPage() {
  const me = await requireUser();
  if (!can.manageUsers(me.role)) return <NoAccess message="User management is not available for your role." />;

  const supabase = await createServerClient();
  const parents = await queryActiveUsers(supabase);
  // Server-only check. Never expose the key itself, only whether it exists.
  const configured = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);

  return (
    <div className="space-y-4">
      <Link href="/users" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Back to users
      </Link>
      <h1 className="text-xl font-semibold tracking-tight">Create user</h1>

      {!configured && (
        <Alert variant="destructive" className="max-w-lg">
          <AlertDescription>
            User creation is not set up on this machine. Add <code>SUPABASE_SERVICE_ROLE_KEY</code> to <code>.env.local</code> (server-only,
            never <code>NEXT_PUBLIC_</code>) and restart the dev server.
          </AlertDescription>
        </Alert>
      )}

      {parents.ok ? <UserForm mode="create" parents={parents.data} /> : <ErrorState message={parents.error} />}
    </div>
  );
}
