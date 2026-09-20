import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { TerritoryEditor } from "@/components/org/TerritoryEditor";
import { ErrorState, NoAccess } from "@/components/shared/states";
import { requireUser } from "@/lib/auth";
import { queryUser } from "@/lib/org/queries";
import { queryCatalog, queryManagerScopes } from "@/lib/org/territory";
import { can } from "@/lib/permissions";
import { createServerClient } from "@/lib/supabase/server";

export const metadata = { title: "Edit territory · Parmar CRM" };

// Task A2.1: assign projects and locations to one manager.
export default async function EditTerritoryPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireUser();
  if (!can.editTerritories(me.role)) return <NoAccess message="Territories are not available for your role." />;

  const { id } = await params;
  const supabase = await createServerClient();
  const [user, catalog, managers] = await Promise.all([queryUser(supabase, id), queryCatalog(supabase), queryManagerScopes(supabase)]);

  if (!user.ok) return <ErrorState title="User not found" message={user.error} />;
  if (user.data.role !== "manager") {
    return <NoAccess message="Only managers hold a territory. Sub-managers and callers inherit their manager's." />;
  }
  if (!user.data.isActive) return <NoAccess message="This manager is deactivated." />;
  if (!catalog.ok) return <ErrorState message={catalog.error} />;
  if (!managers.ok) return <ErrorState message={managers.error} />;

  return (
    <div className="space-y-4">
      <Link href="/territories" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Back to territories
      </Link>
      <h1 className="text-xl font-semibold tracking-tight">{user.data.fullName}&apos;s territory</h1>
      <TerritoryEditor manager={{ id: user.data.id, fullName: user.data.fullName }} catalog={catalog.data} managers={managers.data} />
    </div>
  );
}
