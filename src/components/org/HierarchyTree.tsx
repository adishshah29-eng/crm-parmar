import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { ROLE_LABEL } from "@/lib/schemas/user";
import type { HierarchyNode } from "@/lib/org/queries";
import { cn } from "@/lib/utils";

/**
 * Read-only org tree with lead counts, for checking the real org against the system.
 * Server-rendered with native <details>, so it needs no client JavaScript.
 * "Open" = the lead has not reached a terminal stage (booked or dropped).
 */
export function HierarchyTree({ nodes }: { nodes: HierarchyNode[] }) {
  return (
    <ul className="space-y-1">
      {nodes.map((n) => (
        <TreeNode key={n.id} node={n} depth={0} />
      ))}
    </ul>
  );
}

function TreeNode({ node, depth }: { node: HierarchyNode; depth: number }) {
  const hasKids = node.children.length > 0;
  const row = (
    <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5", !node.isActive && "opacity-50")}>
      <Link href={`/users/${node.id}`} className="font-medium hover:underline">
        {node.fullName}
      </Link>
      <Badge variant="outline">{ROLE_LABEL[node.role]}</Badge>
      {!node.isActive && <Badge variant="outline">Deactivated</Badge>}
      <span className="text-xs text-muted-foreground">
        Own {node.ownOpen} open / {node.ownTotal} total
        {hasKids && ` · Team ${node.teamOpen} open / ${node.teamTotal} total · ${node.descendants} ${node.descendants === 1 ? "person" : "people"} below`}
      </span>
    </div>
  );

  return (
    <li>
      {hasKids ? (
        // The top two levels start open; deeper levels are one click away.
        <details open={depth < 2}>
          <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">{row}</summary>
          <ul className="ml-3 space-y-1 border-l pl-4">
            {node.children.map((c) => (
              <TreeNode key={c.id} node={c} depth={depth + 1} />
            ))}
          </ul>
        </details>
      ) : (
        <div className="pl-0">{row}</div>
      )}
    </li>
  );
}
