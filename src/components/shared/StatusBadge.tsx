import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * The ONE badge for every status in the product. Colours are fixed in
 * brain/07-ui-conventions.md — do not add a colour outside slate/amber/blue/red/green,
 * and do not write your own badge.
 */
type Tone = "slate" | "slate-muted" | "amber" | "blue" | "red" | "green";

const TONE_CLASS: Record<Tone, string> = {
  slate: "bg-slate-100 text-slate-700 border-slate-200",
  "slate-muted": "bg-slate-50 text-slate-400 border-slate-200",
  amber: "bg-amber-100 text-amber-800 border-amber-200",
  blue: "bg-blue-100 text-blue-800 border-blue-200",
  red: "bg-red-100 text-red-800 border-red-200",
  green: "bg-green-100 text-green-800 border-green-200",
};

const MAP = {
  call_status: {
    new: ["New", "slate"],
    attempted: ["Attempted", "amber"],
    connected: ["Connected", "blue"],
    lost: ["Lost", "slate-muted"],
  },
  temperature: {
    hot: ["Hot", "red"],
    warm: ["Warm", "amber"],
    cold: ["Cold", "slate"],
  },
  // Only booked and dropped have a fixed colour. Every other stage is slate until the team agrees more.
  pipeline_stage: {
    enquiry: ["Enquiry", "slate"],
    qualified: ["Qualified", "slate"],
    site_visit_scheduled: ["Visit scheduled", "slate"],
    site_visit_done: ["Visit done", "slate"],
    negotiation: ["Negotiation", "slate"],
    booked: ["Booked", "green"],
    dropped: ["Dropped", "slate-muted"],
  },
} as const satisfies Record<string, Record<string, readonly [string, Tone]>>;

type Props =
  | { kind: "call_status"; value: keyof typeof MAP.call_status }
  | { kind: "temperature"; value: keyof typeof MAP.temperature }
  | { kind: "pipeline_stage"; value: keyof typeof MAP.pipeline_stage }
  | { kind: "sla_breached" };

export function StatusBadge(props: Props & { className?: string }) {
  if (props.kind === "sla_breached") {
    return (
      <Badge variant="outline" className={cn(TONE_CLASS.red, "gap-1", props.className)}>
        <AlertTriangle className="size-3" aria-hidden />
        SLA breached
      </Badge>
    );
  }
  const table = MAP[props.kind] as Record<string, readonly [string, Tone]>;
  const entry = table[props.value];
  if (!entry) return null;
  const [label, tone] = entry;
  return (
    <Badge variant="outline" className={cn(TONE_CLASS[tone], props.className)}>
      {label}
    </Badge>
  );
}
