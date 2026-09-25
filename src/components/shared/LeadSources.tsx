import { formatDateTime } from "@/lib/format";
import type { LeadSourceEntry } from "@/types/leads";

/**
 * Every source this lead ever arrived from. Duplicates add a row here and never a second lead
 * (D-006), so this list is how you see that the same buyer came in twice.
 */
export function LeadSources({ sources }: { sources: LeadSourceEntry[] }) {
  return (
    <section className="space-y-3 rounded-2xl bg-card shadow-sm p-4">
      <h2 className="font-semibold">Sources</h2>
      {sources.length === 0 ? (
        <p className="text-sm text-muted-foreground">No source recorded for this lead.</p>
      ) : (
        <ul className="space-y-3">
          {sources.map((s, i) => (
            <li key={`${s.code}-${s.receivedAt}-${i}`} className="text-sm">
              <p className="font-medium">
                {s.name}
                {s.isLive && <span className="ml-2 text-xs font-normal text-muted-foreground">live</span>}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatDateTime(s.receivedAt)}
                {s.campaign ? ` · ${s.campaign}` : ""}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
