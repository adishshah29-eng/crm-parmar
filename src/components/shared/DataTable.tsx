import Link from "next/link";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/shared/states";
import { SelectAllCheckbox, SelectRowCheckbox } from "@/components/shared/selection";
import { withParams, type SearchParams } from "@/lib/leads/params";
import { cn } from "@/lib/utils";

/**
 * The ONE table. Server-driven: the page reads searchParams, calls getLeads, passes rows here.
 * Sorting and paging are plain links, so there is no client state and no fetching in the browser.
 * Never fetch every lead and filter in the browser. Never build a second table.
 */
export type Column<T> = {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  /** Makes the header a sort link. Must be one of LEAD_SORT_COLUMNS. */
  sortKey?: string;
  /** The cell that carries the row link (row click opens the detail page, never a modal). */
  primary?: boolean;
  /** Applied to th and td. e.g. "hidden md:table-cell" to drop a column on phones. */
  className?: string;
};

type Props<T extends { id: string }> = {
  columns: Column<T>[];
  rows: T[];
  total: number;
  page: number;
  pageSize?: number;
  /** Current `column:dir`, so the active header can show its arrow. */
  sort?: string;
  /** The page's searchParams — needed to build sort and paging links that keep the filters. */
  searchParams: SearchParams;
  rowHref: (row: T) => string;
  /** Filters, usually <LeadFilters />. */
  toolbar?: ReactNode;
  /**
   * Adds a checkbox column. Must be rendered inside <SelectionProvider> (components/shared/selection).
   * Pass rowLabel so each checkbox has a screen-reader name.
   */
  selectable?: boolean;
  rowLabel?: (row: T) => string;
  emptyTitle?: string;
  emptyHint?: string;
  /** What the rows are, for the count line ("0 leads"). */
  itemLabel?: string;
};

export function DataTable<T extends { id: string }>({
  columns,
  rows,
  total,
  page,
  pageSize = 25,
  sort,
  searchParams,
  rowHref,
  toolbar,
  selectable = false,
  rowLabel,
  emptyTitle = "No leads match",
  emptyHint = "Try clearing a filter, or check back when new leads arrive.",
  itemLabel = "leads",
}: Props<T>) {
  const [sortCol, sortDir] = (sort ?? "").split(":");
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  return (
    <div className="space-y-3">
      {toolbar}

      {rows.length === 0 ? (
        <EmptyState title={emptyTitle} hint={emptyHint} />
      ) : (
        <div className="max-h-[70vh] overflow-auto rounded-2xl bg-card shadow-sm">
          <Table>
            <TableHeader className="sticky top-0 z-20 bg-card shadow-[0_1px_0_var(--border)]">
              <TableRow>
                {selectable && (
                  <TableHead className="w-8">
                    <SelectAllCheckbox ids={rows.map((r) => r.id)} />
                  </TableHead>
                )}
                {columns.map((c) => {
                  const active = c.sortKey && c.sortKey === sortCol;
                  const nextDir = active && sortDir === "desc" ? "asc" : "desc";
                  return (
                    <TableHead key={c.key} className={c.className}>
                      {c.sortKey ? (
                        <Link
                          href={withParams(searchParams, { sort: `${c.sortKey}:${nextDir}` })}
                          className="inline-flex items-center gap-1 hover:text-foreground"
                        >
                          {c.header}
                          {active && (sortDir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
                        </Link>
                      ) : (
                        c.header
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                // relative: the primary cell's link stretches over the whole row
                <TableRow key={row.id} className="relative hover:bg-muted/50">
                  {selectable && (
                    <TableCell className="w-8">
                      <SelectRowCheckbox id={row.id} label={rowLabel ? rowLabel(row) : row.id} />
                    </TableCell>
                  )}
                  {columns.map((c) => (
                    <TableCell key={c.key} className={c.className}>
                      {c.primary ? (
                        <Link
                          href={rowHref(row)}
                          className="block after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring"
                        >
                          {c.cell(row)}
                        </Link>
                      ) : (
                        c.cell(row)
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
        <span>{total === 0 ? `0 ${itemLabel}` : `${from}–${to} of ${total}`}</span>
        <div className="flex items-center gap-2">
          <PageLink disabled={page <= 1} href={withParams(searchParams, { page: String(page - 1) })} label="Previous">
            <ChevronLeft className="size-4" />
          </PageLink>
          <span>
            Page {page} of {pages}
          </span>
          <PageLink disabled={page >= pages} href={withParams(searchParams, { page: String(page + 1) })} label="Next">
            <ChevronRight className="size-4" />
          </PageLink>
        </div>
      </div>
    </div>
  );
}

function PageLink({ disabled, href, label, children }: { disabled: boolean; href: string; label: string; children: ReactNode }) {
  const cls = buttonVariants({ variant: "outline", size: "icon" });
  return disabled ? (
    <span aria-disabled="true" aria-label={label} className={cn(cls, "pointer-events-none opacity-40")}>
      {children}
    </span>
  ) : (
    <Link href={href} aria-label={label} className={cls}>
      {children}
    </Link>
  );
}

/** Use from loading.tsx: skeleton rows, not a spinner. */
export function DataTableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading leads">
      <Skeleton className="h-9 w-full max-w-md" />
      <div className="space-y-2 rounded-2xl bg-card p-3 shadow-sm">
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    </div>
  );
}
