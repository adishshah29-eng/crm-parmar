import Link from "next/link";
import { Bell } from "lucide-react";
import type { ReactNode } from "react";
import { requireUser } from "@/lib/auth";
import { navFor } from "@/lib/nav";
import { SidebarNav } from "@/components/shared/SidebarNav";
import { SignOutButton } from "@/components/shared/SignOutButton";

const ROLE_LABEL = {
  super_admin: "Super admin",
  admin: "Admin",
  manager: "Manager",
  sub_manager: "Sub manager",
  caller: "Caller",
} as const;

// The app shell: sidebar, top bar, role-aware nav, notification bell.
// Everything under (app)/ renders inside this. proxy.ts already blocked signed-out users;
// requireUser() is the second line and also loads the role.
export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  // Only pass serialisable fields to the client component.
  const items = navFor(user.role).map(({ label, href }) => ({ label, href }));

  return (
    <div className="flex min-h-svh flex-col md:flex-row">
      <aside className="border-b p-3 md:w-56 md:shrink-0 md:border-r md:border-b-0 md:p-4">
        <p className="mb-3 hidden px-3 text-lg font-semibold tracking-tight md:block">Parmar CRM</p>
        <SidebarNav items={items} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{user.fullName}</p>
            <p className="text-xs text-muted-foreground">{ROLE_LABEL[user.role]}</p>
          </div>
          <div className="flex items-center gap-2">
            {/* Bell is wired to notifications in Week 1. Unread count comes from getUnread(). */}
            <button type="button" aria-label="Notifications" className="rounded-md p-2 text-muted-foreground hover:bg-muted">
              <Bell className="size-4" />
            </button>
            <Link href="/set-password" className="hidden text-sm text-muted-foreground underline-offset-2 hover:underline sm:inline">
              Change password
            </Link>
            <SignOutButton />
          </div>
        </header>
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
