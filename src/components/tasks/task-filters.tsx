"use client";

import { Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { TASK_PRIORITIES } from "@/lib/enums";
import { PRIORITY_LABELS } from "@/lib/priority";
import type { TaskListFilters } from "@/lib/task-list-params";
import { buildHref, normalizeSearchParams } from "@/lib/urls";
import { cn } from "@/lib/utils";

type Option = { id: string; name: string };

const FILTER_KEYS = ["status", "phase", "assignee", "label", "priority", "q"] as const;

/** Search (live, no Enter needed), filters and grouping – all kept in the URL. */
export function TaskFilters(props: {
  statuses: Option[];
  phases: Option[];
  members: Option[];
  labels: Option[];
  filters: TaskListFilters;
  grouped: boolean;
  count: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(props.filters.q ?? "");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // Show the toggle at once; `grouped` from the URL follows after the navigation.
  const [grouped, setGrouped] = useState(props.grouped);
  const [syncedGrouped, setSyncedGrouped] = useState(props.grouped);
  if (syncedGrouped !== props.grouped) {
    setSyncedGrouped(props.grouped);
    setGrouped(props.grouped);
  }

  function apply(overrides: Record<string, string | null>) {
    const params = normalizeSearchParams(Object.fromEntries(searchParams.entries()));
    router.replace(buildHref(pathname, params, overrides), { scroll: false });
  }

  useEffect(() => () => clearTimeout(timer.current), []);

  const active = Object.keys(props.filters).length > 0;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative w-full sm:w-56">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <input
          type="search"
          aria-label="Suche"
          placeholder="Titel oder Nummer…"
          value={q}
          onChange={(e) => {
            const value = e.target.value;
            setQ(value);
            clearTimeout(timer.current);
            timer.current = setTimeout(() => apply({ q: value.trim() || null }), 300);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              clearTimeout(timer.current);
              apply({ q: q.trim() || null });
            }
          }}
          className="h-8 w-full rounded-md border bg-background pr-2 pl-8 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </div>
      <FilterSelect id="f-status" label="Status" value={props.filters.statusId} options={props.statuses} onChange={(v) => apply({ status: v || null })} />
      <FilterSelect id="f-assignee" label="Zuständig" value={props.filters.assigneeId} options={props.members} onChange={(v) => apply({ assignee: v || null })} />
      <FilterSelect
        id="f-priority"
        label="Priorität"
        value={props.filters.priority}
        options={TASK_PRIORITIES.map((p) => ({ id: p, name: PRIORITY_LABELS[p] }))}
        onChange={(v) => apply({ priority: v || null })}
      />
      {props.labels.length > 0 && (
        <FilterSelect id="f-label" label="Label" value={props.filters.labelId} options={props.labels} onChange={(v) => apply({ label: v || null })} />
      )}
      {props.phases.length > 0 && (
        <FilterSelect id="f-phase" label="Phase" value={props.filters.phaseId} options={props.phases} onChange={(v) => apply({ phase: v || null })} />
      )}
      {active && (
        <button
          type="button"
          onClick={() => {
            setQ("");
            apply(Object.fromEntries(FILTER_KEYS.map((k) => [k, null])));
          }}
          className="inline-flex h-8 items-center gap-1 px-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <X className="size-3.5" /> Zurücksetzen
        </button>
      )}
      <div className="ml-auto flex items-center gap-3">
        <span className="text-sm text-muted-foreground" aria-live="polite">
          {props.count} {props.count === 1 ? "Aufgabe" : "Aufgaben"}
        </span>
        <label className="flex cursor-pointer items-center gap-1.5 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={grouped}
            onChange={(e) => {
              setGrouped(e.target.checked);
              apply({ group: e.target.checked ? null : "none" });
            }}
          />
          Nach Status gruppieren
        </label>
      </div>
    </div>
  );
}

function FilterSelect(props: { id: string; label: string; value?: string; options: Option[]; onChange: (v: string) => void }) {
  // Keep the picked option visible while the URL catches up.
  const [value, setValue] = useState(props.value ?? "");
  const [synced, setSynced] = useState(props.value);
  if (synced !== props.value) {
    setSynced(props.value);
    setValue(props.value ?? "");
  }
  const selected = !!value;
  return (
    // Label is a sibling, not a wrapper: a wrapping <label> would add the selected option to the accessible name.
    <div
      className={cn(
        "flex h-8 items-center gap-1 rounded-md border pl-2 text-xs transition-colors",
        selected ? "border-primary/40 bg-primary/10 text-foreground" : "text-muted-foreground",
      )}
    >
      <label htmlFor={props.id}>{props.label}</label>
      <select
        id={props.id}
        className="h-full cursor-pointer rounded-r-md bg-transparent pr-1 text-sm text-foreground outline-none"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          props.onChange(e.target.value);
        }}
      >
        <option value="">Alle</option>
        {props.options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
    </div>
  );
}
