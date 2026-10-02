"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { longDate, MONTH_NAMES, monthGrid, monthOf, shiftMonth, WEEKDAYS_SHORT, weekdayIndex } from "@/lib/calendar";
import { addDays, todayInZone } from "@/lib/dates";
import { cn } from "@/lib/utils";

const iconButton =
  "flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50";
const headerButton =
  "rounded-md px-1.5 py-1 text-[13px] font-medium outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50";
const pickButton =
  "flex h-10 items-center justify-center rounded-md text-[13px] tabular-nums outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50";
const pickActive = "bg-primary text-primary-foreground hover:bg-primary/90";

/**
 * Month calendar for picking one day. Works on ISO days (YYYY-MM-DD), never on local Date objects, so the
 * picked day cannot shift with the browser's time zone. Arrow keys, Home/End and PageUp/PageDown move the
 * focus like in a native date grid; the header jumps to a month or year.
 */
export function Calendar({
  selected,
  onSelect,
  className,
}: {
  selected: string | null;
  onSelect: (iso: string) => void;
  className?: string;
}) {
  const today = useMemo(() => todayInZone(), []);
  const [month, setMonth] = useState(() => monthOf(selected ?? today));
  const [view, setView] = useState<"days" | "months" | "years">("days");
  const [yearAnchor, setYearAnchor] = useState(() => Number(month.slice(0, 4)));
  const [direction, setDirection] = useState<1 | -1>(1);
  const gridRef = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef<string | null>(null);

  const days = useMemo(() => monthGrid(month), [month]);
  const [year, monthIndex] = [Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1];
  const label = `${MONTH_NAMES[monthIndex]} ${year}`;
  const focusable = selected && monthOf(selected) === month ? selected : monthOf(today) === month ? today : `${month}-01`;

  // Keyboard navigation across a month boundary re-renders the grid: focus the target once it exists.
  useEffect(() => {
    if (!pendingFocus.current) return;
    gridRef.current?.querySelector<HTMLElement>(`[data-day="${pendingFocus.current}"]`)?.focus();
    pendingFocus.current = null;
  }, [month]);

  function go(next: string) {
    setDirection(next < month ? -1 : 1);
    setMonth(next);
  }

  function onGridKey(event: React.KeyboardEvent) {
    const current = (event.target as HTMLElement).dataset.day;
    if (!current) return;
    const weekday = weekdayIndex(current);
    const offsets: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7, Home: -weekday, End: 6 - weekday };
    let target: string | undefined;
    if (event.key in offsets) target = addDays(current, offsets[event.key]);
    if (event.key === "PageUp" || event.key === "PageDown") {
      const targetMonth = shiftMonth(monthOf(current), event.key === "PageUp" ? -1 : 1);
      const [ty, tm] = targetMonth.split("-").map(Number);
      const lastDay = new Date(Date.UTC(ty, tm, 0)).getUTCDate();
      target = `${targetMonth}-${String(Math.min(Number(current.slice(8)), lastDay)).padStart(2, "0")}`;
    }
    if (!target) return;
    event.preventDefault();
    if (monthOf(target) !== month) {
      pendingFocus.current = target;
      go(monthOf(target));
      return;
    }
    gridRef.current?.querySelector<HTMLElement>(`[data-day="${target}"]`)?.focus();
  }

  return (
    <div data-slot="calendar" className={cn("w-[17rem] select-none", className)}>
      <div className="sr-only" aria-live="polite" aria-atomic="true">{label}</div>
      <div className="mb-2 flex items-center justify-between gap-1">
        <button type="button" aria-label="Vorheriger Monat" className={iconButton} onClick={() => go(shiftMonth(month, -1))}>
          <ChevronLeft className="size-4" />
        </button>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            aria-label="Monat wählen"
            className={cn(headerButton, view === "months" && "bg-muted")}
            onClick={() => setView(view === "months" ? "days" : "months")}
          >
            {MONTH_NAMES[monthIndex]}
          </button>
          <button
            type="button"
            aria-label="Jahr wählen"
            className={cn(headerButton, "tabular-nums", view === "years" && "bg-muted")}
            onClick={() => {
              setYearAnchor(year);
              setView(view === "years" ? "days" : "years");
            }}
          >
            {year}
          </button>
        </div>
        <button type="button" aria-label="Nächster Monat" className={iconButton} onClick={() => go(shiftMonth(month, 1))}>
          <ChevronRight className="size-4" />
        </button>
      </div>

      {view === "days" && (
        <div
          key={month}
          className={cn(
            "duration-150 animate-in fade-in motion-reduce:animate-none",
            direction === 1 ? "slide-in-from-right-2" : "slide-in-from-left-2",
          )}
        >
          <div className="mb-1 grid grid-cols-7" aria-hidden>
            {WEEKDAYS_SHORT.map((day) => (
              <div key={day} className="flex h-7 items-center justify-center text-[11px] font-medium text-muted-foreground">{day}</div>
            ))}
          </div>
          <div ref={gridRef} role="grid" aria-label={label} className="grid grid-cols-7 gap-y-0.5" onKeyDown={onGridKey}>
            {Array.from({ length: 6 }, (_, week) => (
              <div key={week} role="row" className="contents">
                {days.slice(week * 7, week * 7 + 7).map((day) => {
                  const outside = monthOf(day) !== month;
                  const isSelected = day === selected;
                  const isToday = day === today;
                  return (
                    <div key={day} role="gridcell" aria-selected={isSelected || undefined} className="flex h-8 items-center justify-center">
                      <button
                        type="button"
                        data-day={day}
                        aria-label={longDate(day)}
                        aria-current={isToday ? "date" : undefined}
                        tabIndex={day === focusable ? 0 : -1}
                        onClick={() => onSelect(day)}
                        className={cn(
                          "flex size-8 items-center justify-center rounded-full text-[13px] tabular-nums outline-none transition-colors",
                          "focus-visible:ring-2 focus-visible:ring-ring/50",
                          outside ? "text-muted-foreground/50" : "text-foreground",
                          !isSelected && "hover:bg-muted",
                          isSelected && "bg-primary text-primary-foreground hover:bg-primary/90",
                          isToday && !isSelected && "border border-border font-semibold",
                        )}
                      >
                        {Number(day.slice(8))}
                      </button>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      {view === "months" && (
        <div className="grid grid-cols-3 gap-1 py-1 duration-150 animate-in fade-in">
          {MONTH_NAMES.map((name, i) => (
            <button
              key={name}
              type="button"
              className={cn(pickButton, i === monthIndex && pickActive)}
              onClick={() => {
                go(`${year}-${String(i + 1).padStart(2, "0")}`);
                setView("days");
              }}
            >
              {name.slice(0, 3)}
            </button>
          ))}
        </div>
      )}

      {view === "years" && (
        <div className="duration-150 animate-in fade-in">
          <div className="mb-1 flex items-center justify-between px-0.5">
            <button type="button" aria-label="Frühere Jahre" className={iconButton} onClick={() => setYearAnchor((y) => y - 12)}>
              <ChevronLeft className="size-4" />
            </button>
            <span className="text-[11px] font-medium text-muted-foreground tabular-nums">{yearAnchor - 5}–{yearAnchor + 6}</span>
            <button type="button" aria-label="Spätere Jahre" className={iconButton} onClick={() => setYearAnchor((y) => y + 12)}>
              <ChevronRight className="size-4" />
            </button>
          </div>
          <div className="grid grid-cols-3 gap-1 py-1">
            {Array.from({ length: 12 }, (_, i) => yearAnchor - 5 + i).map((y) => (
              <button
                key={y}
                type="button"
                className={cn(pickButton, y === year && pickActive)}
                onClick={() => {
                  go(`${y}${month.slice(4)}`);
                  setView("months");
                }}
              >
                {y}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
