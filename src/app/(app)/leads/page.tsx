import Link from "next/link";
import { getLeads } from "@/actions/leads";
import { AssignLeadsBar } from "@/components/admin/AssignLeadsBar";
import { ExportButton } from "@/components/admin/ExportButton";
import { buttonVariants } from "@/components/ui/button";
import { DataTable } from "@/components/shared/DataTable";
import { LeadFilters } from "@/components/shared/LeadFilters";
import { leadColumns } from "@/components/shared/lead-columns";
import { SelectionProvider } from "@/components/shared/selection";
import { ErrorState, NoAccess } from "@/components/shared/states";
import { requireUser } from "@/lib/auth";
import { parseLeadSearchParams, type SearchParams } from "@/lib/leads/params";
import { queryActiveUsers } from "@/lib/org/queries";
import { can } from "@/lib/permissions";
import { createServerClient } from "@/lib/supabase/server";

export const metadata = { title: "All leads · Parmar CRM" };

const PAGE_SIZE = 25;

// Admin's all-leads screen (task A2.3): every lead, every filter, and where an admin assigns leads
// down to managers. Also the REFERENCE for the other portals: read searchParams -> getLeads ->
// <DataTable>. Copy the shape, not the file.
export default async function AllLeadsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser();
  if (!can.viewAllLeads(user.role)) return <NoAccess message="This screen is not available for your role." />;

  const sp = await searchParams;
  const { page, sort, filters } = parseLeadSearchParams(sp);

  const supabase = await createServerClient();
  const [result, projects, sources, people] = await Promise.all([
    getLeads({ page, pageSize: PAGE_SIZE, sort, filters }),
    supabase.from("projects").select("id, name").eq("is_active", true).order("name"),
    supabase.from("sources").select("code, name").order("name"),
    queryActiveUsers(supabase),
  ]);

  // Who leads can be given to: people who work leads. Same list feeds the owner filter.
  const assignees = (people.ok ? people.data : []).filter((p) => p.role === "manager" || p.role === "sub_manager" || p.role === "caller");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">All leads</h1>
        <div className="flex gap-2">
          {can.import(user.role) && (
            <Link href="/import" className={buttonVariants({ variant: "outline" })}>
              Import CSV
            </Link>
          )}
          {can.export(user.role) && <ExportButton total={result.ok ? result.data.total : 0} />}
        </div>
      </div>

      {result.ok ? (
        <SelectionProvider>
          <AssignLeadsBar assignees={assignees} />
          <DataTable
            selectable
            rowLabel={(r) => r.personName ?? r.phone}
            columns={[
              leadColumns.buyer,
              leadColumns.project,
              leadColumns.callStatus,
              leadColumns.temperature,
              leadColumns.stage,
              leadColumns.owner,
              leadColumns.lastActivity,
              leadColumns.sla,
            ]}
            rows={result.data.rows}
            total={result.data.total}
            page={page}
            pageSize={PAGE_SIZE}
            sort={sort}
            searchParams={sp}
            rowHref={(r) => `/leads/${r.id}`}
            toolbar={
              <LeadFilters
                projects={projects.data ?? []}
                sources={sources.data ?? []}
                owners={assignees.map((a) => ({ id: a.id, name: a.fullName }))}
                showOwnerScope
                showUnassigned
                showDates
              />
            }
          />
        </SelectionProvider>
      ) : (
        <ErrorState message={result.error} />
      )}
    </div>
  );
}
