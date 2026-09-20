"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useTransition, type FormEvent } from "react";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ALL_ROLES, ROLE_LABEL } from "@/lib/schemas/user";

const selectCls =
  "h-8 rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/** Role filter + name search for the users list. Edits the URL only; the server page re-renders. */
export function UserFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, startTransition] = useTransition();

  const set = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    startTransition(() => router.replace(`${pathname}${next.size ? `?${next}` : ""}`));
  };

  const onSearch = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const q = new FormData(e.currentTarget).get("q");
    set({ q: typeof q === "string" ? q.trim() || undefined : undefined });
  };

  const active = !!(sp.get("role") || sp.get("q"));

  return (
    <div className="flex flex-wrap items-center gap-2" aria-busy={pending}>
      <form onSubmit={onSearch} className="flex gap-2">
        <div className="relative w-64">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input key={sp.get("q") ?? ""} name="q" defaultValue={sp.get("q") ?? ""} placeholder="Search by name" className="pl-8" aria-label="Search users" />
        </div>
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </form>
      <select aria-label="Role" className={selectCls} value={sp.get("role") ?? ""} onChange={(e) => set({ role: e.target.value || undefined })}>
        <option value="">Any role</option>
        {ALL_ROLES.map((r) => (
          <option key={r} value={r}>
            {ROLE_LABEL[r]}
          </option>
        ))}
      </select>
      {active && (
        <Button variant="ghost" size="sm" onClick={() => startTransition(() => router.replace(pathname))}>
          <X /> Clear
        </Button>
      )}
    </div>
  );
}
