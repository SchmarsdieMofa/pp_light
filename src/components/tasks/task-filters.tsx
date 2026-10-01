"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { TASK_PRIORITIES } from "@/lib/enums";
import { PRIORITY_LABELS } from "@/lib/priority";
import type { TaskListFilters } from "@/lib/task-list-params";
import { buildHref, normalizeSearchParams } from "@/lib/urls";

type Option = { id: string; name: string };

const selectClass = "h-8 rounded-md border bg-background px-2 text-sm";

export function TaskFilters(props: {
  statuses: Option[];
  members: Option[];
  labels: Option[];
  filters: TaskListFilters;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(props.filters.q ?? "");

  function apply(key: string, value: string) {
    const params = normalizeSearchParams(Object.fromEntries(searchParams.entries()));
    router.replace(buildHref(pathname, params, { [key]: value || null }));
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <FilterSelect id="f-status" label="Status" value={props.filters.statusId} options={props.statuses} onChange={(v) => apply("status", v)} />
      <FilterSelect id="f-assignee" label="Zuständig" value={props.filters.assigneeId} options={props.members} onChange={(v) => apply("assignee", v)} />
      <FilterSelect id="f-label" label="Label" value={props.filters.labelId} options={props.labels} onChange={(v) => apply("label", v)} />
      <FilterSelect
        id="f-priority"
        label="Priorität"
        value={props.filters.priority}
        options={TASK_PRIORITIES.map((p) => ({ id: p, name: PRIORITY_LABELS[p] }))}
        onChange={(v) => apply("priority", v)}
      />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          apply("q", q.trim());
        }}
      >
        <Input aria-label="Suche" placeholder="Suchen… (Enter)" value={q} onChange={(e) => setQ(e.target.value)} className="h-8 w-48" />
      </form>
    </div>
  );
}

function FilterSelect(props: { id: string; label: string; value?: string; options: Option[]; onChange: (v: string) => void }) {
  return (
    // Label is a sibling, not a wrapper: a wrapping <label> would add the selected option to the accessible name.
    <div className="flex items-center gap-1 text-xs text-muted-foreground">
      <label htmlFor={props.id}>{props.label}</label>
      <select id={props.id} className={selectClass} value={props.value ?? ""} onChange={(e) => props.onChange(e.target.value)}>
        <option value="">Alle</option>
        {props.options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </div>
  );
}
