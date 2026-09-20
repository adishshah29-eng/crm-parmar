import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { HierarchyTree } from "@/components/org/HierarchyTree";
import { EmptyState, ErrorState, NoAccess } from "@/components/shared/states";
import { requireUser } from "@/lib/auth";
import { buildHierarchy, queryLeadCounts, queryUsers } from "@/lib/org/queries";
import { can } from "@/lib/permissions";
import { createServerClient } from "@/lib/supabase/server";

export const metadata = { title: "Hierarchy · Parmar CRM" };

// Task A1.4: read-only org tree with lead counts. This is what Gautam checks the real org against.
export default async function HierarchyPage() {
  const me = await requireUser();
  if (!can.manageUsers(me.role)) return <NoAccess message="The hierarchy view is not available for your role." />;

  const supabase = await createServerClient();
  const [users, counts] = await Promise.all([queryUsers(supabase, {}), queryLeadCounts(supabase)]);

  return (
    <div className="space-y-4">
      <Link href="/users" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Back to users
      </Link>
      <h1 className="text-xl font-semibold tracking-tight">Hierarchy</h1>
      <p className="text-sm text-muted-foreground">
        Who reports to whom, with lead counts. &quot;Open&quot; means the lead has not reached booked or dropped.
      </p>

      {!users.ok ? (
        <ErrorState message={users.error} />
      ) : !counts.ok ? (
        <ErrorState title="Counts unavailable" message={counts.error} />
      ) : users.data.length === 0 ? (
        <EmptyState title="No users yet" hint="Create the first user from the Users page." />
      ) : (
        <HierarchyTree nodes={buildHierarchy(users.data, counts.data)} />
      )}
    </div>
  );
}
