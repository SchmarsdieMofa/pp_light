"use client";

import { de } from "date-fns/locale";
import { CalendarOffIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { undoScheduleAction, updateTaskAction } from "@/app/(app)/tasks/actions";
import { Gantt, type GanttColumn } from "@/components/reui/gantt/gantt";
import {
  GanttDatePicker,
  GanttNav,
  GanttNavNext,
  GanttNavPrev,
  GanttNavToday,
  GanttScaleSwitcher,
  GanttTitle,
} from "@/components/reui/gantt/gantt-nav";
import type { GanttProposedUpdate, GanttScale } from "@/components/reui/gantt/gantt-types";
import { GanttView as GanttTimeline } from "@/components/reui/gantt/gantt-view";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useTaskHref } from "@/components/tasks/use-task-href";
import { type BarData, inclusiveDue, initialDate, isoDate, toChartData } from "@/lib/gantt";
import type { GanttData } from "@/server/gantt/queries";
import { ganttI18nDe } from "./gantt-i18n-de";

type Notice = { kind: "saved"; movedCount: number; groupId: string | null } | { kind: "error"; message: string } | { kind: "undone" };
const noticeKey = "pp-light:gantt-notice";
const scaleKey = "pp-light:gantt-scale";
// "day" is an hourly axis – project plans work in whole days, so it is not offered.
const scales: GanttScale[] = ["week", "month", "quarter", "year"];
const subscribe = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

/** sessionStorage can be blocked (privacy mode, policies) – the chart must still work without it. */
function readStorage(key: string): string | null {
  try { return typeof window === "undefined" ? null : sessionStorage.getItem(key); } catch { return null; }
}
function writeStorage(key: string, value: string) {
  try { sessionStorage.setItem(key, value); } catch { /* ignore */ }
}
function removeStorage(key: string) {
  try { sessionStorage.removeItem(key); } catch { /* ignore */ }
}

function showNotice(notice: Notice) {
  if (notice.kind === "error") return toast.error(notice.message);
  if (notice.kind === "undone") return toast.success("Termine wiederhergestellt");
  if (!notice.movedCount || !notice.groupId) return toast.success("Termin gespeichert");
  const count = notice.movedCount;
  toast.success(`${count} ${count === 1 ? "Aufgabe" : "Aufgaben"} verschoben`, {
    duration: 15_000,
    action: { label: "Rückgängig", onClick: async () => {
      const result = await undoScheduleAction(notice.groupId!);
      if (!result.ok) return toast.error(result.error.message);
      writeStorage(noticeKey, JSON.stringify({ kind: "undone" } satisfies Notice));
      window.location.reload();
    } },
  });
}

export function GanttView({ data, projectKey, canEdit }: { data: GanttData; projectKey: string; canEdit: boolean }) {
  const mounted = useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
  const [scale, setScale] = useState<GanttScale>(() => {
    const stored = readStorage(scaleKey) as GanttScale | null;
    return stored && scales.includes(stored) ? stored : "month";
  });
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const router = useRouter();
  const taskHref = useTaskHref();
  // Every RSC render delivers a new `data` object; the chart input only changes when the content does.
  const dataKey = JSON.stringify(data);
  const stableData = useMemo(() => JSON.parse(dataKey) as GanttData, [dataKey]);
  const collapseKey = `pp-light:gantt-collapsed:${projectKey}`;
  const [collapsed, setCollapsed] = useState<string[]>(() => {
    try { return JSON.parse(readStorage(collapseKey) ?? "[]") as string[]; } catch { return []; }
  });
  const chart = useMemo(() => toChartData(stableData, projectKey), [stableData, projectKey]);
  const taskById = useMemo(() => new Map(stableData.tasks.map((task) => [task.id, task])), [stableData]);
  const [anchor] = useState(() => initialDate(chart.events));

  useEffect(() => {
    const raw = readStorage(noticeKey);
    removeStorage(noticeKey);
    if (raw) {
      try { showNotice(JSON.parse(raw) as Notice); } catch { /* old tab data */ }
    }
  }, []);

  const changeScale = useCallback((value: GanttScale) => {
    setScale(value);
    writeStorage(scaleKey, value);
  }, []);

  const changeCollapsed = useCallback((ids: string[]) => {
    setCollapsed(ids);
    writeStorage(collapseKey, JSON.stringify(ids));
  }, [collapseKey]);

  const saveDates = useCallback(async (id: string, start: Date, end: Date) => {
    const original = taskById.get(id);
    if (!original || busy.current) return;
    const startDate = isoDate(start);
    const dueDate = inclusiveDue(end);
    if (startDate === original.startDate && dueDate === original.dueDate) return;
    busy.current = true;
    setSaving(true);
    let notice: Notice;
    try {
      const result = await updateTaskAction(id, original.updatedAt, { startDate, dueDate });
      notice = result.ok
        ? { kind: "saved", movedCount: result.data.movedCount, groupId: result.data.groupId }
        : { kind: "error", message: result.error.message };
    } catch {
      notice = { kind: "error", message: "Speichern fehlgeschlagen – bitte erneut versuchen." };
    }
    // Moving one task can shift its successors server-side, so the whole plan is reloaded.
    writeStorage(noticeKey, JSON.stringify(notice));
    window.location.reload();
  }, [taskById]);

  // Bars only move in time: a drop onto another row, on a phase or milestone, or while saving is refused.
  const canDrop = useCallback((update: GanttProposedUpdate<BarData>) =>
    canEdit && !busy.current && update.event.data?.kind === "task"
      && (update.resourceId === undefined || update.resourceId === update.event.resourceId), [canEdit]);

  const onEventUpdate = useCallback((update: GanttProposedUpdate<BarData>) => {
    if (!canDrop(update)) return false;
    void saveDates(update.event.id, update.start, update.end);
    return true;
  }, [canDrop, saveDates]);

  const openTask = useCallback((id: string) => {
    if (taskById.has(id)) router.push(taskHref(id));
  }, [router, taskById, taskHref]);

  const columns = useMemo<GanttColumn[]>(() => [
    { id: "start", title: "Start", width: 84, render: ({ resource }) => chart.rows.get(resource.id)?.startLabel },
    { id: "due", title: "Fällig", width: 84, render: ({ resource }) => chart.rows.get(resource.id)?.dueLabel },
    { id: "hint", title: "Hinweis", width: 140, render: ({ resource }) => {
      const hint = chart.rows.get(resource.id)?.hint;
      return hint ? <span className="truncate text-amber-600 dark:text-amber-400">{hint}</span> : null;
    } },
  ], [chart.rows]);

  if (!mounted) return <div className="rounded-lg border p-6 text-sm text-muted-foreground">Zeitplan wird geladen…</div>;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Zeitplan</h2>
          <p className="text-xs text-muted-foreground">
            {canEdit ? "Aufgaben ziehen oder am Rand verlängern. Termine folgen Arbeitstagen." : "Nur Ansicht – Termine können hier nicht geändert werden."}
          </p>
        </div>
        {saving && <p role="status" className="text-sm text-muted-foreground">Termin wird gespeichert…</p>}
      </div>
      <Gantt<BarData>
        aria-label="Gantt-Zeitplan"
        className="min-h-0 flex-1 overflow-hidden rounded-lg border bg-card"
        events={chart.events}
        resources={chart.resources}
        scale={scale}
        onScaleChange={changeScale}
        defaultDate={anchor}
        locale={de}
        i18n={ganttI18nDe}
        interactions={{ drag: canEdit, resize: canEdit, selectSlot: false }}
        canDropEvent={canDrop}
        onEventUpdate={onEventUpdate}
        onEventClick={(occurrence) => openTask(occurrence.event.id)}
        onResourceClick={({ resource }) => openTask(resource.id)}
        collapsedGroups={collapsed}
        onCollapsedGroupsChange={changeCollapsed}
        scheduleMode="single"
        rowCheckboxes={false}
        offDays
        barLabel="auto"
        timelineLines="both"
        columns={columns}
        treePanel={{ width: 520, nameColumnWidth: 240, maxWidth: 760 }}
        navButtonVariant="outline"
      >
        <GanttNav>
          <TooltipProvider delay={600} closeDelay={0} timeout={300}>
            <GanttNavToday />
            <div className="flex items-center gap-1">
              <GanttNavPrev />
              <GanttNavNext />
            </div>
            <GanttDatePicker />
            <GanttTitle />
            <div className="grow" />
            {chart.unscheduled.length > 0 && (
              <UnscheduledTasks tasks={chart.unscheduled} projectKey={projectKey} taskHref={taskHref} />
            )}
            <GanttScaleSwitcher scales={scales} />
          </TooltipProvider>
        </GanttNav>
        {chart.resources.length > 0 ? <GanttTimeline /> : (
          <div className="flex flex-1 flex-col items-center justify-center gap-1 p-6 text-center">
            <p className="text-sm font-medium">Noch keine Aufgaben mit Start und Fälligkeit.</p>
            <p className="text-xs text-muted-foreground">Sobald eine Aufgabe beide Termine hat, erscheint sie hier im Zeitplan.</p>
          </div>
        )}
      </Gantt>
    </div>
  );
}

/** Tasks without start or due date cannot be drawn; they stay one click away instead of pushing the chart down. */
function UnscheduledTasks({ tasks, projectKey, taskHref }: {
  tasks: GanttData["tasks"];
  projectKey: string;
  taskHref: (id: string) => string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button variant="outline" size="sm" />}>
        <CalendarOffIcon aria-hidden="true" />
        Ohne Termin ({tasks.length})
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-2">
        <p className="px-2 pt-1 pb-2 text-xs text-muted-foreground">Ohne vollständigen Termin</p>
        <ul className="max-h-72 overflow-y-auto">
          {tasks.map((task) => (
            <li key={task.id}>
              <Link href={taskHref(task.id)} onClick={() => setOpen(false)}
                className="block truncate rounded-md px-2 py-1.5 text-sm hover:bg-accent">
                {projectKey}-{task.number} {task.title}
              </Link>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
