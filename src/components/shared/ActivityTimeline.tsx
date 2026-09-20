import { EmptyState } from "@/components/shared/states";
import { formatDateTime, formatWhen } from "@/lib/format";
import { ACTIVITY_LABEL } from "@/lib/leads/labels";
import type { LeadActivity } from "@/types/leads";

/**
 * Read-only history, newest first. The table behind it is append-only — there is deliberately
 * no update or delete policy, so this component has no edit affordance and must not get one.
 */
export function ActivityTimeline({ activities }: { activities: LeadActivity[] }) {
  return (
    <section className="space-y-3 rounded-lg border p-4">
      <h2 className="font-semibold">Activity</h2>
      {activities.length === 0 ? (
        <EmptyState
          title="Nothing logged yet"
          hint="The first call outcome or remark goes here, and stops the 45-minute SLA clock."
        />
      ) : (
        <ol className="space-y-4">
          {activities.map((a) => (
            <li key={a.id} className="border-l-2 pl-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                <span className="font-medium">
                  {ACTIVITY_LABEL[a.activityType] ?? a.activityType}
                  {a.fromValue && a.toValue && (
                    <span className="font-normal text-muted-foreground"> · {a.fromValue} → {a.toValue}</span>
                  )}
                </span>
                <time dateTime={a.createdAt} title={formatDateTime(a.createdAt)} className="text-xs text-muted-foreground">
                  {formatWhen(a.createdAt)}
                </time>
              </div>
              {a.remark && <p className="mt-1 text-sm whitespace-pre-wrap">{a.remark}</p>}
              <p className="mt-0.5 text-xs text-muted-foreground">{a.userName ?? "Team member"}</p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
