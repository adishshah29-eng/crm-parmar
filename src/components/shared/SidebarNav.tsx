"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarCheck,
  ClipboardList,
  Download,
  History,
  LayoutDashboard,
  Layers,
  MapPin,
  MapPinned,
  Phone,
  Siren,
  Users,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { NavItem } from "@/lib/nav";

// Icons live here, keyed by route, so adding a screen to NAV (lib/nav.ts) never needs a change in
// this file: an unknown route just gets the fallback icon.
const ICONS: Record<string, LucideIcon> = {
  "/my-day": Phone,
  "/dashboard": LayoutDashboard,
  "/leads": Layers,
  "/users": Users,
  "/territories": MapPin,
  "/import": Download,
  "/audit": History,
  "/team/leads": Layers,
  "/team": UsersRound,
  "/team/escalations": Siren,
  "/attendance": CalendarCheck,
  "/visits": MapPinned,
};

export function SidebarNav({ items }: { items: Pick<NavItem, "label" | "href">[] }) {
  const pathname = usePathname();
  // With /team, /team/leads and /team/escalations all in the nav, only the longest match is "current".
  const current = items
    .filter((i) => pathname === i.href || pathname.startsWith(`${i.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    <nav className="flex gap-1 overflow-x-auto md:flex-col md:gap-1.5 md:overflow-visible" aria-label="Main">
      {items.map((item) => {
        const active = item.href === current;
        const Icon = ICONS[item.href] ?? ClipboardList;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex shrink-0 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
              active
                ? "bg-accent text-accent-foreground md:after:absolute md:after:top-2 md:after:-right-3 md:after:bottom-2 md:after:w-0.5 md:after:rounded-full md:after:bg-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="size-5 shrink-0" aria-hidden />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
