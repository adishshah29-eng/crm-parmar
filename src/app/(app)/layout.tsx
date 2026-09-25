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

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("") || "?";

// The app shell: floating rounded sidebar, top bar, role-aware nav, notification bell.
// Everything under (app)/ renders inside this. proxy.ts already blocked signed-out users;
// requireUser() is the second line and also loads the role.
export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  // Only pass serialisable fields to the client component.
  const items = navFor(user.role).map(({ label, href }) => ({ label, href }));

  return (
    <div className="flex min-h-svh flex-col gap-3 p-3 md:flex-row md:gap-6 md:p-4">
      <aside className="rounded-3xl bg-sidebar p-3 shadow-sm md:sticky md:top-4 md:h-[calc(100svh-2rem)] md:w-60 md:shrink-0 md:overflow-y-auto md:p-5">
        <div className="mb-3 hidden items-center gap-3 px-1 md:mb-8 md:flex">
          <span className="grid size-10 place-items-center rounded-xl bg-primary text-base font-bold text-primary-foreground">P</span>
          <span className="text-lg font-semibold tracking-tight">Parmar CRM</span>
        </div>
        <SidebarNav items={items} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 px-1 py-2 md:px-2">
          <p className="text-sm text-muted-foreground">
            Welcome back, <span className="font-medium text-foreground">{user.fullName.split(" ")[0]}</span>
          </p>
          <div className="flex items-center gap-2 rounded-full bg-card p-1.5 pl-3 shadow-sm">
            {/* Bell is wired to notifications in Week 1. Unread count comes from getUnread(). */}
            <button type="button" aria-label="Notifications" className="rounded-full p-1.5 text-muted-foreground hover:bg-muted">
              <Bell className="size-4" />
            </button>
            <Link href="/set-password" className="hidden text-sm text-muted-foreground underline-offset-2 hover:underline sm:inline">
              Change password
            </Link>
            <SignOutButton />
            <div className="flex items-center gap-2 pr-1">
              <span className="grid size-8 place-items-center rounded-full bg-accent text-xs font-semibold text-accent-foreground" aria-hidden>
                {initials(user.fullName)}
              </span>
              <div className="hidden min-w-0 leading-tight sm:block">
                <p className="max-w-32 truncate text-sm font-medium">{user.fullName}</p>
                <p className="text-xs text-muted-foreground">{ROLE_LABEL[user.role]}</p>
              </div>
            </div>
          </div>
        </header>
        <main className="flex-1 px-1 pt-2 pb-4 md:px-2">{children}</main>
      </div>
    </div>
  );
}
