"use client";

import { useEffect, useOptimistic, useRef, useTransition } from "react";

type Option = { id: string; name: string; color?: string };

/** Native <details> dropdown with checkboxes – no popover library needed. Escape and outside clicks close it. */
export function MultiSelect(props: {
  label: string;
  options: Option[];
  selected: string[];
  disabled: boolean;
  onChange: (ids: string[]) => Promise<void>;
}) {
  const [, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic(props.selected);
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const summary = props.options.filter((o) => optimistic.includes(o.id)).map((o) => o.name).join(", ") || "–";

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      const details = detailsRef.current;
      if (details?.open && !details.contains(event.target as Node)) details.open = false;
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  function toggle(id: string, checked: boolean) {
    const next = checked ? [...optimistic, id] : optimistic.filter((x) => x !== id);
    startTransition(async () => {
      setOptimistic(next);
      await props.onChange(next);
    });
  }

  return (
    <details
      ref={detailsRef}
      className="relative"
      onKeyDown={(e) => {
        if (e.key === "Escape" && detailsRef.current?.open) {
          e.preventDefault();
          detailsRef.current.open = false;
          detailsRef.current.querySelector("summary")?.focus();
        }
      }}
    >
      <summary
        aria-label={`${props.label}: ${summary}`}
        className="cursor-pointer list-none truncate rounded-md border px-2 py-1 text-sm"
      >
        {summary}
      </summary>
      <div role="group" aria-label={props.label} className="absolute z-20 mt-1 w-60 space-y-1 rounded-md border bg-popover p-2 shadow-md">
        {props.options.length === 0 && <p className="text-xs text-muted-foreground">Keine Einträge</p>}
        {props.options.map((o) => (
          <label key={o.id} className="flex items-center gap-2 text-sm">
            {/* Never disabled while saving: disabling the focused checkbox would drop keyboard focus. */}
            <input
              type="checkbox"
              checked={optimistic.includes(o.id)}
              disabled={props.disabled}
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
