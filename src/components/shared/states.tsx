import { AlertCircle, Inbox, Lock } from "lucide-react";
import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";

// The four states every screen needs (brain/07-ui-conventions.md): loading, empty, error, no-access.

export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  /** Say what to do next, not "No data". */
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed p-10 text-center">
      <Inbox className="size-6 text-muted-foreground" aria-hidden />
      <p className="font-medium">{title}</p>
      {hint && <p className="max-w-sm text-sm text-muted-foreground">{hint}</p>}
      {action}
    </div>
  );
}

export function ErrorState({
  title = "Something went wrong",
  message,
  action,
}: {
  title?: string;
  /** What failed and what to try. Never a raw Postgres error. */
  message: string;
  action?: ReactNode;
}) {
  return (
    <div role="alert" className="flex flex-col items-center gap-2 rounded-lg border border-destructive/30 p-10 text-center">
      <AlertCircle className="size-6 text-destructive" aria-hidden />
      <p className="font-medium">{title}</p>
      <p className="max-w-sm text-sm text-muted-foreground">{message}</p>
      {action}
    </div>
  );
}

/** Shown when RLS returns nothing for an id, or a screen is not available for the role. */
export function NoAccess({
  message = "You don't have access to this page.",
}: {
  message?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl bg-card shadow-sm p-10 text-center">
      <Lock className="size-6 text-muted-foreground" aria-hidden />
      <p className="font-medium">Not available</p>
      <p className="max-w-sm text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

/** Skeleton rows, not a spinner. */
export function LoadingSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}
