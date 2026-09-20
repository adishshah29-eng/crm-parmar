import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { UserFilters } from "@/components/org/UserFilters";
import { EmptyState, ErrorState, NoAccess } from "@/components/shared/states";
import { requireUser } from "@/lib/auth";
import { formatPhone } from "@/lib/format";
import { queryUsers } from "@/lib/org/queries";
import { can } from "@/lib/permissions";
import { ALL_ROLES, ROLE_LABEL } from "@/lib/schemas/user";
import { createServerClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata = { title: "Users · Parmar CRM" };

// Task A1.1. Super admin only. Deactivated users stay in the list, greyed, never hidden.
export default async function UsersPage({ searchParams }: { searchParams: Promise<{ role?: string; q?: string }> }) {
  const me = await requireUser();
  if (!can.manageUsers(me.role)) return <NoAccess message="User management is not available for your role." />;

  const sp = await searchParams;
  const role = ALL_ROLES.find((r) => r === sp.role);
  const supabase = await createServerClient();
  const result = await queryUsers(supabase, { role, search: sp.q });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">Users</h1>
        <div className="flex gap-2">
          <Link href="/users/hierarchy" className={buttonVariants({ variant: "outline" })}>
            View hierarchy
          </Link>
          <Link href="/users/new" className={buttonVariants()}>
            Create user
          </Link>
        </div>
      </div>

      <UserFilters />

      {!result.ok ? (
        <ErrorState message={result.error} />
      ) : result.data.length === 0 ? (
        <EmptyState title="No users match" hint="Clear the search or the role filter." />
      ) : (
        <div className="overflow-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="hidden md:table-cell">Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="hidden sm:table-cell">Reports to</TableHead>
                <TableHead className="hidden sm:table-cell text-right">Territories</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.data.map((u) => (
                <TableRow key={u.id} className={cn("relative hover:bg-muted/50", !u.isActive && "opacity-50")}>
                  <TableCell>
                    <Link href={`/users/${u.id}`} className="block after:absolute after:inset-0 after:content-['']">
                      <span className="font-medium">{u.fullName}</span>
                      {u.phone && <span className="block text-xs text-muted-foreground">{formatPhone(u.phone)}</span>}
                    </Link>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">{u.email}</TableCell>
                  <TableCell>{ROLE_LABEL[u.role]}</TableCell>
                  <TableCell className="hidden sm:table-cell">{u.parentName ?? <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell className="hidden sm:table-cell text-right">
                    {u.role === "manager" ? u.territoryCount : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{u.isActive ? "Active" : "Deactivated"}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        {result.ok ? `${result.data.length} ${result.data.length === 1 ? "user" : "users"}` : ""} · Territories apply to managers only; sub-managers and callers inherit.
      </p>
    </div>
  );
}
