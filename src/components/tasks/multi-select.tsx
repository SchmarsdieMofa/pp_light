"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { ChevronsUpDown } from "lucide-react";
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
      className="group relative"
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
        className="flex h-8 cursor-pointer list-none items-center justify-between gap-2 rounded-md border bg-background px-2.5 text-sm transition-colors select-none hover:bg-muted/60 group-open:bg-muted/60 [&::-webkit-details-marker]:hidden"
      >
        <span className={cn("truncate", summary === "–" && "text-muted-foreground")}>{summary}</span>
        <ChevronsUpDown className="size-3.5 shrink-0 opacity-50" aria-hidden />
      </summary>
      <div role="group" aria-label={props.label} className="absolute right-0 left-0 z-20 mt-1 space-y-0.5 rounded-lg border bg-popover p-1 shadow-lg">
        {props.options.length === 0 && <p className="px-2 py-1.5 text-xs text-muted-foreground">Keine Einträge</p>}
        {props.options.map((o) => (
          <label key={o.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent">
            {/* Never disabled while saving: disabling the focused checkbox would drop keyboard focus. */}
            <Checkbox
              checked={optimistic.includes(o.id)}
              disabled={props.disabled}
              onCheckedChange={(checked) => toggle(o.id, checked)}
            />
            {o.color && <span className="size-2 rounded-full" style={{ backgroundColor: o.color }} />}
            {o.name}
          </label>
        ))}
      </div>
    </details>
  );
}
