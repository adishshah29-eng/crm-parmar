import { Skeleton } from "@/components/ui/skeleton";

// Skeletons, not spinners (07-ui-conventions.md). They mirror the real page's shape so nothing jumps
// when the data arrives. Used by loading.tsx files: Next shows them at once while the server works.

/** Heading, an action or filter row, then card-like rows. For list screens. */
export function ListPageSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading">
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-10 w-28" />
      </div>
      <Skeleton className="h-10 w-full sm:w-2/3" />
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-2xl" />
        ))}
      </div>
    </div>
  );
}

/** Heading, a summary card, then two sections. For detail and editor screens. */
export function DetailPageSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading">
      <div className="space-y-2">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      <Skeleton className="h-36 w-full rounded-2xl" />
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-48 w-full rounded-2xl" />
        <Skeleton className="h-48 w-full rounded-2xl" />
      </div>
    </div>
  );
}
