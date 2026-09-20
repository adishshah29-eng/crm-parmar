import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { CatalogManager } from "@/components/org/CatalogManager";
import { ErrorState, NoAccess } from "@/components/shared/states";
import { requireUser } from "@/lib/auth";
import { distinctCities, queryCatalog, queryProjectLeadCounts } from "@/lib/org/territory";
import { can } from "@/lib/permissions";
import { createServerClient } from "@/lib/supabase/server";

export const metadata = { title: "Projects & locations · Parmar CRM" };

// Task A2.2: create and edit projects and locations. Never hardcode a project list anywhere else.
export default async function ProjectsPage() {
  const me = await requireUser();
  if (!can.editTerritories(me.role)) return <NoAccess message="Projects and locations are not available for your role." />;

  const supabase = await createServerClient();
  const catalog = await queryCatalog(supabase);
  if (!catalog.ok) return <ErrorState message={catalog.error} />;
  const leadCounts = await queryProjectLeadCounts(supabase, catalog.data.projects.map((p) => p.id));

  return (
    <div className="space-y-4">
      <Link href="/territories" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Back to territories
      </Link>
      <h1 className="text-xl font-semibold tracking-tight">Projects &amp; locations</h1>
      <p className="text-sm text-muted-foreground">
        New projects appear in filters, imports and the territory editor as soon as you add them. Nothing is deleted: a project can be made inactive.
      </p>
      <CatalogManager catalog={catalog.data} cities={distinctCities(catalog.data)} leadCounts={leadCounts} />
    </div>
  );
}
