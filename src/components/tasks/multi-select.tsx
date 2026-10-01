"use client";

import { useOptimistic, useTransition } from "react";

type Option = { id: string; name: string; color?: string };

/** Native <details> dropdown with checkboxes – no popover library needed. */
export function MultiSelect(props: {
  label: string;
  options: Option[];
  selected: string[];
  disabled: boolean;
  onChange: (ids: string[]) => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic(props.selected);
  const summary = props.options.filter((o) => optimistic.includes(o.id)).map((o) => o.name).join(", ") || "–";

  function toggle(id: string, checked: boolean) {
    const next = checked ? [...optimistic, id] : optimistic.filter((x) => x !== id);
    startTransition(async () => {
      setOptimistic(next);
      await props.onChange(next);
    });
  }

  return (
    <details className="relative">
      <summary aria-label={props.label} className="cursor-pointer list-none truncate rounded-md border px-2 py-1 text-sm">
        {summary}
      </summary>
      <div role="group" aria-label={props.label} className="absolute z-20 mt-1 w-60 space-y-1 rounded-md border bg-popover p-2 shadow-md">
        {props.options.length === 0 && <p className="text-xs text-muted-foreground">Keine Einträge</p>}
        {props.options.map((o) => (
          <label key={o.id} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={optimistic.includes(o.id)}
              disabled={props.disabled || pending}
              onChange={(e) => toggle(o.id, e.target.checked)}
            />
            {o.color && <span className="size-2 rounded-full" style={{ backgroundColor: o.color }} />}
            {o.name}
          </label>
        ))}
      </div>
    </details>
  );
}
