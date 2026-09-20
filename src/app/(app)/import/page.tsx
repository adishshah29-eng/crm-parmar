import { ErrorReportButton } from "@/components/import/ErrorReportButton";
import { ImportWizard } from "@/components/import/ImportWizard";
import { EmptyState, ErrorState, NoAccess } from "@/components/shared/states";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { queryImports } from "@/lib/import/core";
import { can } from "@/lib/permissions";
import { createServerClient } from "@/lib/supabase/server";

export const metadata = { title: "Import leads · Parmar CRM" };

// Task A3.1. Admin and super_admin only. The upload itself runs in the browser (a client
// component); the rules are applied by the server and the database.
export default async function ImportPage() {
  const me = await requireUser();
  if (!can.import(me.role)) return <NoAccess message="Importing leads is not available for your role." />;

  const supabase = await createServerClient();
  const [sources, projects, history] = await Promise.all([
    supabase.from("sources").select("code, name, is_live").order("name"),
    supabase.from("projects").select("id, name").eq("is_active", true).order("name"),
    queryImports(supabase),
  ]);
  if (sources.error || projects.error) return <ErrorState message="Could not load the sources and projects. Try again in a moment." />;

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">Import leads</h1>
        <p className="text-sm text-muted-foreground">
          Upload a CSV from a portal or ad platform. Same phone and same project is one lead: repeats only add a source and never change the owner.
        </p>
      </div>

      <ImportWizard
        sources={sources.data.map((s) => ({ code: s.code, name: s.name, isLive: s.is_live }))}
        projects={projects.data}
      />

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Recent imports</h2>
        {!history.ok ? (
          <ErrorState message={history.error} />
        ) : history.data.length === 0 ? (
          <EmptyState title="No imports yet" hint="Your first import will be listed here, with its error report." />
        ) : (
          <div className="overflow-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>File</TableHead>
                  <TableHead className="hidden sm:table-cell">By</TableHead>
                  <TableHead className="text-right">Rows</TableHead>
                  <TableHead className="text-right">New</TableHead>
                  <TableHead className="text-right">Duplicates</TableHead>
                  <TableHead className="text-right">Errors</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.data.map((i) => (
                  <TableRow key={i.importId}>
                    <TableCell className="whitespace-nowrap">{formatDateTime(i.createdAt)}</TableCell>
                    <TableCell className="max-w-56 truncate font-medium">{i.filename}</TableCell>
                    <TableCell className="hidden sm:table-cell">{i.uploadedBy ?? "—"}</TableCell>
                    <TableCell className="text-right">{i.totalRows.toLocaleString()}</TableCell>
                    <TableCell className="text-right">{i.inserted.toLocaleString()}</TableCell>
                    <TableCell className="text-right">{i.duplicates.toLocaleString()}</TableCell>
                    <TableCell className="text-right">{i.errors.toLocaleString()}</TableCell>
                    <TableCell className="text-right">
                      {i.errors > 0 && <ErrorReportButton importId={i.importId} filename={i.filename} count={i.errors} />}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}
