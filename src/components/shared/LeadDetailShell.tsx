import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Layout only. Every portal fills the same four slots differently:
 *   header   — who and what (use <LeadSummary /> unless you truly need different)
 *   actions  — caller: call outcome form · manager: reassign · admin: everything
 *   timeline — the activity history (use <ActivityTimeline />)
 *   aside    — sources, site visits, buyer history
 *
 * On a phone the slots stack in that order, so a caller sees the number and the outcome
 * form before the history. On desktop the aside sits to the right.
 */
export function LeadDetailShell({
  header,
  actions,
  timeline,
  aside,
  backHref,
  backLabel = "Back to leads",
}: {
  header: ReactNode;
  actions?: ReactNode;
  timeline?: ReactNode;
  aside?: ReactNode;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      {backHref && (
        <Link href={backHref} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden />
          {backLabel}
        </Link>
      )}
      {header}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-4 md:col-span-2">
          {actions}
          {timeline}
        </div>
        {aside && <aside className="space-y-4">{aside}</aside>}
      </div>
    </div>
  );
}
