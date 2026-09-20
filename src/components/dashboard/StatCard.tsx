import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * One headline number. Optionally a link (to the list it counts). `tone` only uses colours from the
 * fixed palette in 07-ui-conventions.md: amber for "needs attention", red for a breach.
 */
export function StatCard({
  label,
  value,
  hint,
  href,
  tone,
}: {
  label: string;
  value: number;
  hint?: ReactNode;
  href?: string;
  tone?: "attention" | "breach";
}) {
  const body = (
    <>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 text-3xl font-semibold tracking-tight tabular-nums",
          tone === "breach" && value > 0 && "text-red-800",
          tone === "attention" && value > 0 && "text-amber-800",
        )}
      >
        {value.toLocaleString("en-IN")}
      </p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </>
  );
  const cls = "block rounded-lg border p-4";
  return href ? (
    <Link href={href} className={cn(cls, "transition-colors hover:bg-muted/50")}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
