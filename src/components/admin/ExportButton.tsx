"use client";

import { useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { exportLeads } from "@/actions/export";
import { Button } from "@/components/ui/button";
import { downloadCsv } from "@/components/import/error-report";
import { parseLeadSearchParams } from "@/lib/leads/params";

/**
 * Exports exactly what the table is currently filtered to. Only rendered for admin and super_admin,
 * but the server action enforces that too and writes the audit row before returning any data.
 */
export function ExportButton({ total }: { total: number }) {
  const sp = useSearchParams();
  const [pending, startTransition] = useTransition();

  const run = () => {
    const ok = window.confirm(
      `Export the ${total.toLocaleString()} ${total === 1 ? "lead" : "leads"} matching the current filters?\n\nThis contains buyers' phone numbers. The export is recorded in the audit log with your name.`,
    );
    if (!ok) return;
    startTransition(async () => {
      // The same parser the page uses, so "the current filters" means the same thing on both sides.
      const { filters } = parseLeadSearchParams(Object.fromEntries(sp.entries()));
      const res = await exportLeads({ filters });
      if (!res.ok) return void toast.error(res.error);
      downloadCsv(res.data.filename, res.data.csv);
      toast.success(`Exported ${res.data.rowCount.toLocaleString()} ${res.data.rowCount === 1 ? "lead" : "leads"}. This export was logged.`);
    });
  };

  return (
    <Button variant="outline" onClick={run} disabled={pending || total === 0}>
      <Download /> {pending ? "Exporting…" : "Export CSV"}
    </Button>
  );
}
