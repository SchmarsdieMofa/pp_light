"use client";

import { CalendarDays, ChevronLeft, ChevronRight, Filter, List, Rows3, Search, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useOptimistic, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { updateTaskAction } from "@/app/(app)/tasks/actions";
import { PriorityBadge } from "@/components/tasks/task-badges";
import { useTaskHref } from "@/components/tasks/use-task-href";
import { isoWeek, longDate, MONTH_NAMES, monthGrid, monthOf, shiftMonth, WEEKDAYS_SHORT, weekdayIndex } from "@/lib/calendar";
import { addDays, formatDate, weekStart } from "@/lib/dates";
import { buildHref, normalizeSearchParams } from "@/lib/urls";
import { cn } from "@/lib/utils";
import type { CalendarTask } from "@/server/calendar/service";

export type CalendarViewMode = "month" | "week" | "list";
type Project = { id: string; name: string; key: string };

/** Distinct, readable in light and dark. A project keeps its color as long as the project list does not change. */
const PROJECT_COLORS = ["#3b82f6", "#10b981", "#a855f7", "#f97316", "#ec4899", "#14b8a6", "#eab308", "#ef4444", "#6366f1", "#84cc16"];
const MONTH_CHIPS = 3;

export function CalendarView(props: {
  view: CalendarViewMode;
  anchor: string;
  today: string;
  from: string;
  to: string;
  tasks: CalendarTask[];
  projects: Project[];
  selectedProjectIds: string[];
  mine: boolean;
  includeDone: boolean;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const params = normalizeSearchParams(Object.fromEntries(searchParams.entries()));
  const href = (overrides: Record<string, string | null>) => buildHref(pathname, params, { task: null, ...overrides });

  const colorOf = useMemo(() => {
    const map = new Map(props.projects.map((p, i) => [p.id, PROJECT_COLORS[i % PROJECT_COLORS.length]]));
    return (projectId: string) => map.get(projectId) ?? PROJECT_COLORS[0];
  }, [props.projects]);

  const [query, setQuery] = useState("");
  const [, startTransition] = useTransition();
  const [tasks, moveOptimistic] = useOptimistic(props.tasks, (current: CalendarTask[], move: { id: string; dueDate: string }) =>
    current.map((t) => (t.id === move.id ? { ...t, dueDate: move.dueDate } : t)),
  );

  const needle = query.trim().toLocaleLowerCase("de");
  const visible = needle
    ? tasks.filter((t) => `${t.key}-${t.number} ${t.title} ${t.projectName}`.toLocaleLowerCase("de").includes(needle))
    : tasks;
  const byDay = useMemo(() => {
    const map = new Map<string, CalendarTask[]>();
    for (const task of visible) map.set(task.dueDate, [...(map.get(task.dueDate) ?? []), task]);
    return map;
  }, [visible]);
  const overdueCount = visible.filter((t) => !t.isDone && t.dueDate < props.today).length;

  function reschedule(taskId: string, day: string) {
    const task = tasks.find((t) => t.id === taskId);
    if (!task || task.dueDate === day || !task.canEdit) return;
    startTransition(async () => {
      moveOptimistic({ id: taskId, dueDate: day });
      const res = await updateTaskAction(task.id, task.updatedAt, { dueDate: day });
      if (!res.ok) {
        toast.error(res.error.message);
        router.refresh();
        return;
      }
      const moved = res.data.movedCount;
      toast.success(`${task.key}-${task.number} fällig am ${formatDate(day)}${moved > 0 ? ` · ${moved} abhängige verschoben` : ""}`);
    });
  }

  const step = props.view === "month" ? null : props.view === "week" ? 7 : 28;
  const prevDate = step ? addDays(props.anchor, -step) : `${shiftMonth(monthOf(props.anchor), -1)}-01`;
  const nextDate = step ? addDays(props.anchor, step) : `${shiftMonth(monthOf(props.anchor), 1)}-01`;
  const title =
    props.view === "month"
      ? `${MONTH_NAMES[Number(props.anchor.slice(5, 7)) - 1]} ${props.anchor.slice(0, 4)}`
      : props.view === "week"
        ? `KW ${isoWeek(props.from)} · ${shortRange(props.from, props.to)}`
        : `Agenda · ${shortRange(props.from, props.to)}`;

  const chipProps = { colorOf, today: props.today, onDropTask: reschedule };

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold tabular-nums">{title}</h1>
          <nav aria-label="Zeitraum" className="flex items-center gap-1">
            <Link href={href({ date: prevDate })} aria-label="Zurück" className={navButton}><ChevronLeft className="size-4" /></Link>
            <Link href={href({ date: null })} className={cn(navButton, "w-auto px-3 text-sm")}>Heute</Link>
            <Link href={href({ date: nextDate })} aria-label="Weiter" className={navButton}><ChevronRight className="size-4" /></Link>
          </nav>
        </div>
        <nav aria-label="Ansicht" className="flex items-center gap-1 rounded-lg border bg-background p-1">
          {([["month", "Monat", CalendarDays], ["week", "Woche", Rows3], ["list", "Liste", List]] as const).map(([mode, label, Icon]) => (
            <Link
              key={mode}
              href={href({ view: mode === "month" ? null : mode })}
              aria-current={props.view === mode ? "page" : undefined}
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-sm transition-colors",
                props.view === mode ? "bg-muted font-medium" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="size-4" /> {label}
            </Link>
          ))}
        </nav>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            aria-label="Aufgaben im Kalender suchen"
            placeholder="Aufgaben suchen…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="h-8 w-full rounded-md border bg-background pr-2 pl-8 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </div>
        <ProjectFilter
          projects={props.projects}
          selected={props.selectedProjectIds}
          colorOf={colorOf}
          onChange={(ids) => router.push(href({ projects: ids.length ? ids.join(",") : null }))}
        />
        <Toggle pressed={props.mine} href={href({ mine: props.mine ? null : "1" })}>Nur meine</Toggle>
        <Toggle pressed={props.includeDone} href={href({ done: props.includeDone ? null : "1" })}>Erledigte zeigen</Toggle>
        {(props.selectedProjectIds.length > 0 || props.mine || props.includeDone) && (
          <Link href={href({ projects: null, mine: null, done: null })} className="inline-flex items-center gap-1 px-2 text-sm text-muted-foreground hover:text-foreground">
            <X className="size-3.5" /> Filter zurücksetzen
          </Link>
        )}
        <p className="ml-auto text-sm text-muted-foreground" aria-live="polite">
          {visible.length} {visible.length === 1 ? "Aufgabe" : "Aufgaben"}
          {overdueCount > 0 && <span className="font-medium text-destructive"> · {overdueCount} überfällig</span>}
        </p>
      </div>

      {props.view === "month" && (
        <MonthView anchor={props.anchor} byDay={byDay} listHref={(day) => href({ view: "list", date: day })} {...chipProps} />
      )}
      {props.view === "week" && <WeekView from={props.from} byDay={byDay} {...chipProps} />}
      {props.view === "list" && <AgendaView from={props.from} to={props.to} tasks={visible} {...chipProps} />}
    </div>
  );
}

const navButton =
  "inline-flex size-8 items-center justify-center rounded-md border bg-background text-foreground transition-colors hover:bg-muted";

function shortRange(from: string, to: string): string {
  const sameYear = from.slice(0, 4) === to.slice(0, 4);
  const start = `${Number(from.slice(8))}.${Number(from.slice(5, 7))}.${sameYear ? "" : from.slice(0, 4)}`;
  return `${start} – ${formatDate(to)}`;
}

function Toggle({ pressed, href, children }: { pressed: boolean; href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      role="switch"
      aria-checked={pressed}
      className={cn(
        "inline-flex h-8 items-center rounded-md border px-3 text-sm transition-colors",
        pressed ? "border-primary/40 bg-primary/10 font-medium" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </Link>
  );
}

/** Native <details> dropdown with a checkbox per project; empty selection = all projects. */
function ProjectFilter(props: {
  projects: Project[];
  selected: string[];
  colorOf: (id: string) => string;
  onChange: (ids: string[]) => void;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  // Show the click at once; the URL (and with it `selected`) follows after the navigation.
  const [picked, setPicked] = useState(props.selected);
  const [synced, setSynced] = useState(props.selected);
  if (synced !== props.selected) {
    setSynced(props.selected);
    setPicked(props.selected);
  }
  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (ref.current?.open && !ref.current.contains(event.target as Node)) ref.current.open = false;
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);
  const summary =
    picked.length === 0 ? "Alle Projekte" : picked.length === 1
      ? props.projects.find((p) => p.id === picked[0])?.name ?? "1 Projekt"
      : `${picked.length} Projekte`;
  return (
    <details
      ref={ref}
      className="relative"
      onKeyDown={(event) => {
        if (event.key === "Escape" && ref.current?.open) {
          event.preventDefault();
          ref.current.open = false;
          ref.current.querySelector("summary")?.focus();
        }
      }}
    >
      <summary
        aria-label={`Projekte: ${summary}`}
        className="inline-flex h-8 cursor-pointer list-none items-center gap-1.5 rounded-md border px-3 text-sm"
      >
        <Filter className="size-3.5 text-muted-foreground" /> {summary}
      </summary>
      <div role="group" aria-label="Projekte" className="absolute z-30 mt-1 max-h-72 w-64 space-y-1 overflow-y-auto rounded-md border bg-popover p-2 shadow-md">
        {props.projects.map((project) => (
          <label key={project.id} className="flex items-center gap-2 rounded px-1 py-0.5 text-sm hover:bg-muted">
            <input
              type="checkbox"
              checked={picked.includes(project.id)}
              onChange={(event) => {
                const next = event.target.checked ? [...picked, project.id] : picked.filter((id) => id !== project.id);
                setPicked(next);
                props.onChange(next);
              }}
            />
            <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: props.colorOf(project.id) }} />
            <span className="truncate">{project.name}</span>
            <span className="ml-auto text-xs text-muted-foreground">{project.key}</span>
          </label>
        ))}
      </div>
    </details>
  );
}

type ChipShared = {
  colorOf: (projectId: string) => string;
  today: string;
  onDropTask: (taskId: string, day: string) => void;
};

/** A drop target for one day: dragging a task onto it sets the due date. */
function useDayDrop(day: string, onDropTask: ChipShared["onDropTask"]) {
  const [over, setOver] = useState(false);
  return {
    over,
    handlers: {
      onDragOver: (event: React.DragEvent) => {
        if (!event.dataTransfer.types.includes(TASK_MIME)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        if (!over) setOver(true);
      },
      onDragLeave: (event: React.DragEvent) => {
        if (!(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node)) setOver(false);
      },
      onDrop: (event: React.DragEvent) => {
        setOver(false);
        const id = event.dataTransfer.getData(TASK_MIME);
        if (!id) return;
        event.preventDefault();
        onDropTask(id, day);
      },
    },
  };
}

const TASK_MIME = "application/x-pp-task";

function TaskChip({ task, colorOf, today, detailed }: { task: CalendarTask; detailed?: boolean } & Omit<ChipShared, "onDropTask">) {
  const taskHref = useTaskHref();
  const color = colorOf(task.projectId);
  const overdue = !task.isDone && task.dueDate < today;
  return (
    <Link
      href={taskHref(task.id)}
      scroll={false}
      draggable={task.canEdit}
      onDragStart={(event) => {
        event.dataTransfer.setData(TASK_MIME, task.id);
        event.dataTransfer.effectAllowed = "move";
      }}
      title={`${task.key}-${task.number} ${task.title}\n${task.projectName} · ${task.statusName}${overdue ? " · überfällig" : ""}`}
      className={cn(
        "group block rounded-md border-l-[3px] px-1.5 py-0.5 text-xs transition-[background-color,box-shadow] hover:shadow-sm",
        task.canEdit && "cursor-grab active:cursor-grabbing",
        task.isDone && "opacity-60",
      )}
      style={{ borderLeftColor: color, backgroundColor: `color-mix(in srgb, ${color} 14%, transparent)` }}
    >
      <span className={cn("flex items-center gap-1", task.isDone && "line-through")}>
        {overdue && <span className="size-1.5 shrink-0 rounded-full bg-destructive" aria-label="überfällig" />}
        <span className="truncate font-medium">{task.title}</span>
      </span>
      {detailed && (
        <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="tabular-nums">{task.key}-{task.number}</span>
          <span className="truncate">{task.statusName}</span>
        </span>
      )}
    </Link>
  );
}

function MonthView(props: { anchor: string; byDay: Map<string, CalendarTask[]>; listHref: (day: string) => string } & ChipShared) {
  const month = monthOf(props.anchor);
  const days = monthGrid(month);
  const [expanded, setExpanded] = useState<string | null>(null);
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border">
      <div className="grid grid-cols-7 border-b bg-muted/30" aria-hidden>
        {WEEKDAYS_SHORT.map((day, i) => (
          <div key={day} className={cn("px-2 py-1.5 text-center text-xs font-medium text-muted-foreground", i >= 5 && "text-muted-foreground/70")}>{day}</div>
        ))}
      </div>
      <div role="grid" aria-label={`Kalender ${MONTH_NAMES[Number(month.slice(5)) - 1]} ${month.slice(0, 4)}`} className="grid flex-1 auto-rows-fr grid-cols-7">
        {Array.from({ length: 6 }, (_, week) => (
          <div key={week} role="row" className="contents">
            {days.slice(week * 7, week * 7 + 7).map((day) => (
              <MonthCell
                key={day}
                day={day}
                outside={monthOf(day) !== month}
                tasks={props.byDay.get(day) ?? []}
                expanded={expanded === day}
                onExpand={() => setExpanded(expanded === day ? null : day)}
                listHref={props.listHref(day)}
                colorOf={props.colorOf}
                today={props.today}
                onDropTask={props.onDropTask}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function MonthCell(props: {
  day: string;
  outside: boolean;
  tasks: CalendarTask[];
  expanded: boolean;
  onExpand: () => void;
  listHref: string;
} & ChipShared) {
  const { over, handlers } = useDayDrop(props.day, props.onDropTask);
  const isToday = props.day === props.today;
  const weekend = weekdayIndex(props.day) >= 5;
  const shown = props.expanded ? props.tasks : props.tasks.slice(0, MONTH_CHIPS);
  return (
    <div
      role="gridcell"
      aria-label={`${longDate(props.day)}: ${props.tasks.length} ${props.tasks.length === 1 ? "Aufgabe" : "Aufgaben"}`}
      className={cn(
        "flex min-h-16 min-w-0 flex-col gap-1 border-r border-b p-1 transition-colors sm:min-h-24 sm:p-1.5 [&:nth-child(7n)]:border-r-0",
        (props.outside || weekend) && "bg-muted/25",
        over && "bg-primary/10 ring-2 ring-primary/40 ring-inset",
      )}
      {...handlers}
    >
      <Link
        href={props.listHref}
        aria-label={`${longDate(props.day)} in der Liste zeigen`}
        className={cn(
          "flex size-6 items-center justify-center self-start rounded-full text-xs tabular-nums hover:bg-muted",
          props.outside && "text-muted-foreground/60",
          isToday && "bg-primary font-semibold text-primary-foreground hover:bg-primary/90",
        )}
      >
        {Number(props.day.slice(8))}
      </Link>
      {/* Phones: one dot per task – tap the day for its list. Wider: the tasks themselves. */}
      {props.tasks.length > 0 && (
        <div className="flex flex-wrap gap-0.5 sm:hidden" aria-hidden>
          {props.tasks.slice(0, 6).map((task) => (
            <span key={task.id} className="size-1.5 rounded-full" style={{ backgroundColor: props.colorOf(task.projectId) }} />
          ))}
        </div>
      )}
      <div className="hidden min-w-0 space-y-1 sm:block">
        {shown.map((task) => <TaskChip key={task.id} task={task} colorOf={props.colorOf} today={props.today} />)}
        {props.tasks.length > MONTH_CHIPS && (
          <button type="button" onClick={props.onExpand} className="w-full rounded px-1 text-left text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground">
            {props.expanded ? "Weniger" : `+${props.tasks.length - MONTH_CHIPS} weitere`}
          </button>
        )}
      </div>
    </div>
  );
}

function WeekView(props: { from: string; byDay: Map<string, CalendarTask[]> } & ChipShared) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart(props.from), i));
  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden rounded-lg border md:grid-cols-7">
      {days.map((day) => <WeekDay key={day} day={day} tasks={props.byDay.get(day) ?? []} colorOf={props.colorOf} today={props.today} onDropTask={props.onDropTask} />)}
    </div>
  );
}

function WeekDay(props: { day: string; tasks: CalendarTask[] } & ChipShared) {
  const { over, handlers } = useDayDrop(props.day, props.onDropTask);
  const isToday = props.day === props.today;
  return (
    <section
      aria-label={longDate(props.day)}
      className={cn(
        "flex min-h-24 min-w-0 flex-col border-b md:border-r md:border-b-0 md:last:border-r-0",
        weekdayIndex(props.day) >= 5 && "bg-muted/25",
        over && "bg-primary/10 ring-2 ring-primary/40 ring-inset",
      )}
      {...handlers}
    >
      <h2 className="flex items-baseline gap-1.5 border-b px-2 py-1.5 text-xs">
        <span className="font-medium text-muted-foreground">{WEEKDAYS_SHORT[weekdayIndex(props.day)]}</span>
        <span className={cn("tabular-nums", isToday && "rounded-full bg-primary px-1.5 font-semibold text-primary-foreground")}>
          {Number(props.day.slice(8))}.{Number(props.day.slice(5, 7))}.
        </span>
        {props.tasks.length > 0 && <span className="ml-auto text-muted-foreground">{props.tasks.length}</span>}
      </h2>
      <div className="flex-1 space-y-1 overflow-y-auto p-1.5">
        {props.tasks.map((task) => <TaskChip key={task.id} task={task} colorOf={props.colorOf} today={props.today} detailed />)}
      </div>
    </section>
  );
}

function AgendaView(props: { from: string; to: string; tasks: CalendarTask[] } & ChipShared) {
  const shared = { colorOf: props.colorOf, today: props.today, onDropTask: props.onDropTask };
  const overdue = props.tasks.filter((t) => t.dueDate < props.from);
  const groups = new Map<string, CalendarTask[]>();
  for (const task of props.tasks) if (task.dueDate >= props.from) groups.set(task.dueDate, [...(groups.get(task.dueDate) ?? []), task]);
  if (props.tasks.length === 0) {
    return <p className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">Keine Aufgaben in diesem Zeitraum.</p>;
  }
  return (
    <div className="min-h-0 flex-1 space-y-5 overflow-y-auto">
      {overdue.length > 0 && <AgendaGroup heading="Überfällig" tone="danger" tasks={overdue} {...shared} />}
      {[...groups.entries()].map(([day, tasks]) => (
        <AgendaGroup key={day} heading={day === props.today ? `Heute · ${longDate(day)}` : longDate(day)} day={day} tasks={tasks} {...shared} />
      ))}
    </div>
  );
}

function AgendaGroup(props: { heading: string; tasks: CalendarTask[]; day?: string; tone?: "danger" } & ChipShared) {
  const taskHref = useTaskHref();
  const { over, handlers } = useDayDrop(props.day ?? "", props.onDropTask);
  return (
    <section aria-label={props.heading} className={cn("space-y-1.5 rounded-lg", over && "bg-primary/10 ring-2 ring-primary/40")} {...(props.day ? handlers : {})}>
      <h2 className={cn("px-1 text-sm font-medium", props.tone === "danger" ? "text-destructive" : "text-muted-foreground")}>{props.heading}</h2>
      <ul className="divide-y rounded-lg border">
        {props.tasks.map((task) => (
          <li key={task.id}>
            <Link
              href={taskHref(task.id)}
              scroll={false}
              draggable={task.canEdit}
              onDragStart={(event) => {
                event.dataTransfer.setData(TASK_MIME, task.id);
                event.dataTransfer.effectAllowed = "move";
              }}
              className="flex items-center gap-3 px-3 py-2 text-sm transition-colors hover:bg-muted/50"
            >
              <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: props.colorOf(task.projectId) }} aria-hidden />
              <span className="w-16 shrink-0 text-xs text-muted-foreground tabular-nums">{task.key}-{task.number}</span>
              <span className={cn("min-w-0 flex-1 truncate font-medium", task.isDone && "text-muted-foreground line-through")}>{task.title}</span>
              {props.tone === "danger" && <span className="shrink-0 text-xs font-medium text-destructive tabular-nums">{formatDate(task.dueDate)}</span>}
              <span className="hidden w-40 shrink-0 truncate text-xs text-muted-foreground sm:block">{task.projectName}</span>
              <span className="hidden w-24 shrink-0 truncate text-xs text-muted-foreground md:block">{task.statusName}</span>
              <span className="w-16 shrink-0 text-right"><PriorityBadge priority={task.priority} /></span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
