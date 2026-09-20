"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";

/**
 * Row selection for lead tables (bulk assign, bulk reassign). The server-rendered DataTable stays
 * a server component; only these small client pieces hold state.
 *
 *   <SelectionProvider>
 *     <YourBulkBar />            // reads useSelection()
 *     <DataTable selectable … /> // renders the checkboxes
 *   </SelectionProvider>
 *
 * Selection is tied to the current URL (filters, page, sort). Change any of them and it clears,
 * so an action can never touch rows the user can no longer see.
 */
type Selection = {
  ids: string[];
  count: number;
  has: (id: string) => boolean;
  toggle: (id: string) => void;
  setMany: (ids: string[], on: boolean) => void;
  clear: () => void;
};

const Ctx = createContext<Selection | null>(null);

export function SelectionProvider({ children }: { children: ReactNode }) {
  const query = useSearchParams().toString();
  const [state, setState] = useState<{ query: string; ids: Set<string> }>({ query, ids: new Set() });
  // Derived, not synced in an effect: a stale selection from another view is simply ignored.
  const ids = useMemo(() => (state.query === query ? state.ids : new Set<string>()), [state, query]);

  const update = useCallback(
    (fn: (cur: Set<string>) => Set<string>) => setState((s) => ({ query, ids: fn(s.query === query ? s.ids : new Set()) })),
    [query],
  );

  const value = useMemo<Selection>(
    () => ({
      ids: [...ids],
      count: ids.size,
      has: (id) => ids.has(id),
      toggle: (id) =>
        update((cur) => {
          const next = new Set(cur);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        }),
      setMany: (list, on) =>
        update((cur) => {
          const next = new Set(cur);
          for (const id of list) {
            if (on) next.add(id);
            else next.delete(id);
          }
          return next;
        }),
      clear: () => update(() => new Set()),
    }),
    [ids, update],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSelection(): Selection {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSelection must be used inside <SelectionProvider>");
  return v;
}

// `relative z-10` so the checkbox sits above the row-stretching link and clicking it does not open the lead.
const boxCls = "relative z-10 size-4 cursor-pointer accent-primary";

export function SelectRowCheckbox({ id, label }: { id: string; label: string }) {
  const sel = useSelection();
  return <input type="checkbox" className={boxCls} aria-label={`Select ${label}`} checked={sel.has(id)} onChange={() => sel.toggle(id)} />;
}

export function SelectAllCheckbox({ ids }: { ids: string[] }) {
  const sel = useSelection();
  const selectedHere = ids.filter((id) => sel.has(id)).length;
  const all = ids.length > 0 && selectedHere === ids.length;
  return (
    <input
      type="checkbox"
      className={boxCls}
      aria-label="Select all on this page"
      checked={all}
      ref={(el) => {
        if (el) el.indeterminate = selectedHere > 0 && !all;
      }}
      onChange={() => sel.setMany(ids, !all)}
    />
  );
}
