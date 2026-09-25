import Link from "next/link";
import { cn } from "@/lib/utils";
import type { DashboardRange } from "@/lib/dashboard/queries";

/**
 * Today / All time, at the top of the page where Gautam asked for it (not buried in a menu).
 * Plain links, so it needs no client JavaScript and the choice is in the URL (shareable, survives refresh).
 * It changes only the totals and the manager portfolios; the other numbers keep their own windows.
 */
export function RangeToggle({ range }: { range: DashboardRange }) {
  const options: { value: DashboardRange; label: string }[] = [
    { value: "today", label: "Today" },
    { value: "all", label: "All time" },
  ];
  return (
    <nav aria-label="Time range" className="inline-flex rounded-full bg-card p-1 shadow-sm">
      {options.map((o) => (
        <Link
          key={o.value}
          href={`?range=${o.value}`}
          aria-current={range === o.value ? "page" : undefined}
          className={cn(
            "rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
            range === o.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          {o.label}
        </Link>
      ))}
    </nav>
  );
}
