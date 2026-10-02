"use client";

import { Popover } from "@base-ui/react/popover";
import { CalendarDays } from "lucide-react";
import { useState } from "react";
import { Calendar } from "@/components/ui/calendar";
import { addDays, formatDate, parseDateInput, todayInZone, weekStart } from "@/lib/dates";
import { cn } from "@/lib/utils";

/**
 * Date field: type a date ("15.1.", "15.01.2030", "2030-01-15") or pick it from the calendar.
 * Typing saves on Enter or when leaving the field; anything that is no real date restores the last value.
 * `onChange` receives an ISO day or null (cleared) and only fires when the value really changes.
 */
export function DatePicker({
  id,
  label,
  value,
  onChange,
  disabled,
  className,
}: {
  id?: string;
  label: string;
  value: string | null;
  onChange: (iso: string | null) => void;
  disabled?: boolean;
  className?: string;
}) {
  const [text, setText] = useState(formatDate(value));
  const [shown, setShown] = useState(value);
  const [open, setOpen] = useState(false);
  const [invalid, setInvalid] = useState(false);
  // Follow outside changes (picked in the calendar, server value) unless the user is typing.
  if (value !== shown) {
    setShown(value);
    setText(formatDate(value));
  }

  function commit(next: string | null) {
    setInvalid(false);
    setText(formatDate(next));
    if (next !== value) onChange(next);
  }

  function commitText() {
    const trimmed = text.trim();
    if (!trimmed) return commit(null);
    const parsed = parseDateInput(trimmed);
    if (parsed) return commit(parsed);
    setInvalid(true);
    setText(formatDate(value));
  }

  const today = todayInZone();
  const quick = [
    { label: "Heute", iso: today },
    { label: "Morgen", iso: addDays(today, 1) },
    { label: "Nächster Mo", iso: addDays(weekStart(today), 7) },
  ];

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <div className={cn("relative", className)}>
        <input
          id={id}
          aria-label={id ? undefined : label}
          aria-invalid={invalid || undefined}
          inputMode="numeric"
          autoComplete="off"
          placeholder="TT.MM.JJJJ"
          value={text}
          disabled={disabled}
          onChange={(event) => {
            setText(event.target.value);
            setInvalid(false);
          }}
          onBlur={commitText}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commitText();
            } else if (event.key === "ArrowDown" && event.altKey) {
              event.preventDefault();
              setOpen(true);
            }
          }}
          className={cn(
            "h-8 w-full rounded-md border bg-background pr-8 pl-2 text-sm tabular-nums outline-none transition-colors",
            "placeholder:text-muted-foreground/60 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
            "disabled:opacity-60 aria-invalid:border-destructive aria-invalid:ring-destructive/20",
          )}
        />
        <Popover.Trigger
          disabled={disabled}
          aria-label="Kalender öffnen"
          title={`${label} im Kalender wählen`}
          className="absolute inset-y-0 right-0 flex w-8 items-center justify-center rounded-r-md text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-60"
        >
          <CalendarDays className="size-4" />
        </Popover.Trigger>
      </div>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="end" sideOffset={6} collisionPadding={8} className="z-[60]">
          <Popover.Popup
            aria-label={`${label} wählen`}
            className="origin-(--transform-origin) rounded-xl border bg-popover p-3 text-popover-foreground shadow-lg outline-none duration-150 data-[ending-style]:animate-out data-[ending-style]:fade-out-0 data-[ending-style]:zoom-out-95 data-[starting-style]:animate-in data-[starting-style]:fade-in-0 data-[starting-style]:zoom-in-95"
          >
            <Calendar
              selected={value}
              onSelect={(iso) => {
                commit(iso);
                setOpen(false);
              }}
            />
            <div className="mt-2 flex flex-wrap items-center gap-1 border-t pt-2">
              {quick.map((q) => (
                <button
                  key={q.label}
                  type="button"
                  className="rounded-md px-2 py-1 text-xs hover:bg-muted"
                  onClick={() => {
                    commit(q.iso);
                    setOpen(false);
                  }}
                >
                  {q.label}
                </button>
              ))}
              {value && (
                <button
                  type="button"
                  className="ml-auto rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                  onClick={() => {
                    commit(null);
                    setOpen(false);
                  }}
                >
                  Entfernen
                </button>
              )}
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
