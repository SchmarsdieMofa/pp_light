"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { ArrowDown, ArrowUp, CalendarClock, Filter, PartyPopper } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useOptimistic, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { TimeBlockDialog } from "@/components/appointments/time-block-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { TASK_PRIORITIES } from "@/lib/enums";
import { PRIORITY_LABELS } from "@/lib/priority";
import { buildHref, normalizeSearchParams } from "@/lib/urls";
import { toast } from "sonner";
import { completeTaskAction, reopenTaskAction, setMyTaskOrderAction } from "@/app/(app)/my-work/actions";
import { updateTaskAction } from "@/app/(app)/tasks/actions";
import { PriorityBadge } from "@/components/tasks/task-badges";
import { useTaskHref } from "@/components/tasks/use-task-href";
import { addDays } from "@/lib/dates";
import { dueLabel, filterMyWork, groupMyWork, mergeTaskOrder, MY_WORK_GROUPS, myWorkView, orderMyWork } from "@/lib/my-work";
import { cn } from "@/lib/utils";
import type { MyWorkTask } from "@/server/my-work/service";

/** Open tasks assigned to me, by due date. Complete with one click (undo in the toast), push to today/tomorrow inline. */
export function MyWorkList(props: { tasks: MyWorkTask[]; today: string; colorOf: Record<string, string> }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const params = normalizeSearchParams(Object.fromEntries(searchParams.entries()));
  const view = myWorkView(params);
  const filtersId = useId();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filterCount = [view.projectId, view.labelId, view.priority, view.due].filter(Boolean).length;
  const [query, setQuery] = useState(view.q);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const [pending, startTransition] = useTransition();
  const [ordered, reorder] = useOptimistic(props.tasks, (current, ids: string[]) => orderMyWork(current, mergeTaskOrder(current.map((t) => t.id), ids)));
  const [planning, setPlanning] = useState<MyWorkTask | null>(null);
  const [hidden, hide] = useOptimistic<string[], string>([], (current, id) => [...current, id]);
  const taskHref = useTaskHref();
  const visible = filterMyWork(ordered, { ...view, q: query }, props.today);
  if (view.sort === "priority") visible.sort((a, b) => TASK_PRIORITIES.indexOf(b.priority) - TASK_PRIORITIES.indexOf(a.priority));
  const groups = groupMyWork(visible, props.today);
  const sections = view.sort === "due" ? MY_WORK_GROUPS.map((g) => ({ ...g, tasks: groups[g.key] }))
    : [{ key: view.sort, label: view.sort === "manual" ? "Meine Reihenfolge" : "Nach Priorität", tasks: visible }];
  const projects = [...new Map(props.tasks.map((t) => [t.projectId, { value: t.projectId, label: t.projectName }])).values()];
  const labels = [...new Map(props.tasks.flatMap((t) => t.labels.map((l) => [l.id, { value: l.id, label: `${l.name} · ${t.key}` }] as const))).values()];
  const hasFilters = !!(query || view.projectId || view.labelId || view.priority || view.due);
  function apply(overrides: Record<string, string | null>) {
    router.replace(buildHref("/", params, overrides), { scroll: false });
  }
  function move(index: number, direction: number) {
    const ids = visible.map((t) => t.id);
    [ids[index], ids[index + direction]] = [ids[index + direction], ids[index]];
    startTransition(async () => {
      reorder(ids);
      const result = await setMyTaskOrderAction(ids);
      if (!result.ok) toast.error(result.error.message);
    });
  }

  function complete(task: MyWorkTask) {
    startTransition(async () => {
      hide(task.id);
      const res = await completeTaskAction(task.id);
      if (!res.ok) {
        toast.error(res.error.message);
        return;
      }
      toast.success(`${task.key}-${task.path} erledigt`, {
        action: {
          label: "Rückgängig",
          onClick: async () => {
            const undone = await reopenTaskAction(task.id);
            if (!undone.ok) toast.error(undone.error.message);
          },
        },
      });
    });
  }

  function reschedule(task: MyWorkTask, dueDate: string, label: string) {
    startTransition(async () => {
      hide(task.id);
      const res = await updateTaskAction(task.id, task.updatedAt, { dueDate });
      if (!res.ok) toast.error(res.error.message);
      else toast.success(`${task.key}-${task.path} auf ${label} verschoben`);
    });
  }

  const total = props.tasks.length;
  if (total === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed p-10 text-center">
        <PartyPopper className="size-6 text-muted-foreground" aria-hidden />
        <p className="font-medium">Alles erledigt.</p>
        <p className="text-sm text-muted-foreground">Dir sind gerade keine offenen Aufgaben zugewiesen.</p>
      </div>
    );
  }

  const tomorrow = addDays(props.today, 1);
  const actionsFor = (key: string): { label: string; date: string }[] =>
    key === "overdue" || key === "none" ? [{ label: "Heute", date: props.today }, { label: "Morgen", date: tomorrow }]
      : key === "today" ? [{ label: "Morgen", date: tomorrow }]
        : [{ label: "Heute", date: props.today }];

  return (
    <div className="space-y-6">
      <section aria-label="Meine Todos filtern" className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-semibold">Meine Todos</h2>
          <Button variant={filterCount ? "secondary" : "outline"} size="sm" aria-expanded={filtersOpen} aria-controls={filtersId} onClick={() => setFiltersOpen((open) => !open)}>
            <Filter className="size-3.5" aria-hidden />Filtern
            {filterCount > 0 && <span className="rounded-full bg-background px-1.5 text-xs tabular-nums" aria-label={`${filterCount} aktive Filter`}>{filterCount}</span>}
          </Button>
          <span className="ml-auto text-xs text-muted-foreground" aria-live="polite">{visible.length} von {total} Aufgaben</span>
        </div>
        <Input type="search" aria-label="Meine Todos suchen" placeholder="Titel, Nummer oder Projekt suchen…" value={query} onChange={(event) => {
          const value = event.target.value; setQuery(value); clearTimeout(timer.current);
          timer.current = setTimeout(() => apply({ workQ: value || null }), 300);
        }} />
        <div id={filtersId} hidden={!filtersOpen} className={cn("grid-cols-2 gap-2 sm:grid-cols-3", filtersOpen ? "grid" : "hidden")}>
          <Select aria-label="Todos nach Projekt filtern" value={view.projectId} onValueChange={(v) => apply({ workProject: v || null })} options={[{ value: "", label: "Alle Projekte" }, ...projects]} />
          <Select aria-label="Todos nach Label filtern" value={view.labelId} onValueChange={(v) => apply({ workLabel: v || null })} options={[{ value: "", label: "Alle Labels" }, ...labels]} />
          <Select aria-label="Todos nach Priorität filtern" value={view.priority} onValueChange={(v) => apply({ workPriority: v || null })} options={[{ value: "", label: "Alle Prioritäten" }, ...TASK_PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABELS[p] }))]} />
          <Select aria-label="Todos nach Zeitraum filtern" value={view.due} onValueChange={(v) => apply({ workDue: v || null })} options={[{ value: "", label: "Alle Zeiträume" }, ...MY_WORK_GROUPS.map((g) => ({ value: g.key, label: g.label }))]} />
          <Select aria-label="Todos sortieren" value={view.sort} onValueChange={(v) => apply({ workSort: v === "due" ? null : v })} options={[{ value: "due", label: "Nach Fälligkeit" }, { value: "manual", label: "Meine Reihenfolge" }, { value: "priority", label: "Nach Priorität" }]} />
          {hasFilters && <Button variant="ghost" size="sm" onClick={() => { clearTimeout(timer.current); setQuery(""); apply({ workQ: null, workProject: null, workLabel: null, workPriority: null, workDue: null }); }}>Filter zurücksetzen</Button>}
        </div>
        {view.sort === "manual" && <p className="text-xs text-muted-foreground">Mit den Pfeilen legst du deine persönliche Arbeitsreihenfolge fest. Sie wird für dich gespeichert; ausgefilterte Aufgaben behalten ihren Platz.</p>}
      </section>
      {visible.length === 0 && <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">Keine passenden Todos. Passe deine Filter an oder setze sie zurück.</div>}
      {sections.map(({ key, label, tasks: sectionTasks }) => {
        const tasks = sectionTasks.filter((task) => !hidden.includes(task.id));
        if (tasks.length === 0) return null;
        return (
          <section key={key} aria-label={label} className="space-y-2">
            <h2 className={cn("flex items-baseline gap-2 text-sm font-medium", key === "overdue" && "text-destructive")}>
              {label} <span className="text-xs font-normal text-muted-foreground">{tasks.length}</span>
            </h2>
            <ul className="divide-y rounded-xl border bg-card">
              {tasks.map((task, index) => (
                <li key={task.id} className="group flex items-center gap-3 px-3 py-2 text-sm">
                  <Checkbox
                    aria-label={`${task.key}-${task.path} ${task.title} erledigen`}
                    onCheckedChange={() => complete(task)}
                  />
                  <Link href={taskHref(task.id)} scroll={false} className="min-w-0 flex-1">
                    <span className="block truncate font-medium hover:underline">{task.title}</span>
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: props.colorOf[task.projectId] }} aria-hidden />
                      <span className="truncate">{task.projectName}</span>
                      <span className="tabular-nums">· {task.key}-{task.path}</span>
                      <span className="sm:hidden">· {task.dueDate ? dueLabel(task.dueDate, props.today) : "Ohne Termin"}</span>
                    </span>
                    {task.labels.length > 0 && <span className="mt-1 flex flex-wrap gap-1">{task.labels.map((l) => <span key={l.id} className="inline-flex items-center gap-1 rounded-full border px-1.5 text-[11px]"><span className="size-1.5 rounded-full" style={{ backgroundColor: l.color }} />{l.name}</span>)}</span>}
                  </Link>
                  <span className="hidden items-center gap-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 sm:flex">
                    {actionsFor(key).filter((action) => action.date !== task.dueDate).map((action) => (
                      <button
                        key={action.label}
                        type="button"
                        aria-label={`${task.key}-${task.path} auf ${action.label} verschieben`}
                        onClick={() => reschedule(task, action.date, action.label === "Heute" ? "heute" : "morgen")}
                        className="rounded-md border px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        {action.label}
                      </button>
                    ))}
                  </span>
                  <span className="hidden w-16 sm:block">{task.priority !== "none" && <PriorityBadge priority={task.priority} />}</span>
                  <Button variant="ghost" size="icon-sm" aria-label={`${task.key}-${task.path} Zeitblock planen`} title="Zeitblock planen" onClick={() => setPlanning(task)}><CalendarClock className="size-4" /></Button>
                  {view.sort === "manual" && <div className="flex flex-col">
                    <Button variant="ghost" size="icon-sm" aria-label={`${task.key}-${task.path} nach oben`} disabled={pending || index === 0} onClick={() => move(index, -1)}><ArrowUp className="size-3.5" /></Button>
                    <Button variant="ghost" size="icon-sm" aria-label={`${task.key}-${task.path} nach unten`} disabled={pending || index === tasks.length - 1} onClick={() => move(index, 1)}><ArrowDown className="size-3.5" /></Button>
                  </div>}
                  <span
                    className={cn(
                      "hidden w-24 shrink-0 text-right text-xs tabular-nums sm:block",
                      key === "overdue" ? "font-medium text-destructive" : key === "today" ? "font-medium text-amber-600 dark:text-amber-400" : "text-muted-foreground",
                    )}
                  >
                    {task.dueDate ? dueLabel(task.dueDate, props.today) : "–"}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      {planning && <TimeBlockDialog key={planning.id} open onOpenChange={(open) => { if (!open) setPlanning(null); }} tasks={[planning]} initialTaskId={planning.id} date={props.today} />}
    </div>
  );
}
