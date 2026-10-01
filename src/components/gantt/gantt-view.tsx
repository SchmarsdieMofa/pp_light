"use client";

import { Gantt, Willow, WillowDark, type IApi, type IColumnConfig, type IScaleConfig } from "@svar-ui/react-gantt";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { undoScheduleAction, updateTaskAction } from "@/app/(app)/tasks/actions";
import { Button } from "@/components/ui/button";
import { inclusiveDue, isoDate, toChartData } from "@/lib/gantt";
import type { GanttData } from "@/server/gantt/queries";
import { useTaskHref } from "@/components/tasks/use-task-href";
import "@svar-ui/react-gantt/all.css";
import "./gantt.css";

type Zoom = "Tag" | "Woche" | "Monat";
type Notice = { kind: "saved"; movedCount: number; groupId: string | null } | { kind: "error"; message: string } | { kind: "undone" };
const noticeKey = "pp-light:gantt-notice";
const zoomKey = "pp-light:gantt-zoom";
const subscribe = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

const columns: IColumnConfig[] = [
  { id: "text", header: "Aufgabe", width: 250, sort: false },
  { id: "startLabel", header: "Start", width: 100, sort: false },
  { id: "dueLabel", header: "Fällig", width: 100, sort: false },
  { id: "hint", header: "Hinweis", width: 155, sort: false },
];

const month = new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric" });
const year = new Intl.DateTimeFormat("de-DE", { year: "numeric" });
const day = new Intl.DateTimeFormat("de-DE", { day: "2-digit" });

function isoWeek(date: Date): number {
  const utc = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  utc.setUTCDate(utc.getUTCDate() + 4 - (utc.getUTCDay() || 7));
  const first = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  return Math.ceil(((utc.getTime() - first.getTime()) / 86_400_000 + 1) / 7);
}

function scalesFor(zoom: Zoom): { scales: IScaleConfig[]; cellWidth: number } {
  if (zoom === "Tag") return { scales: [
    { unit: "month", step: 1, format: (date) => month.format(date) },
    { unit: "day", step: 1, format: (date) => day.format(date) },
  ], cellWidth: 44 };
  if (zoom === "Woche") return { scales: [
    { unit: "month", step: 1, format: (date) => month.format(date) },
    { unit: "week", step: 1, format: (date) => `KW ${isoWeek(date)}` },
    { unit: "day", step: 1, format: (date) => date.getDay() === 1 ? day.format(date) : "" },
  ], cellWidth: 20 };
  return { scales: [
    { unit: "year", step: 1, format: (date) => year.format(date) },
    { unit: "month", step: 1, format: (date) => month.format(date) },
    { unit: "day", step: 1, format: () => "" },
  ], cellWidth: 10 };
}

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
  const [zoom, setZoom] = useState<Zoom>(() => {
    const stored = readStorage(zoomKey);
    return stored === "Tag" || stored === "Monat" ? stored : "Woche";
  });
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const { resolvedTheme } = useTheme();
  const router = useRouter();
  const taskHref = useTaskHref();
  // Every RSC render delivers a new `data` object. SVAR rebuilds its store (re-expanding collapsed phases)
  // whenever its config changes, so the chart input only changes when the content does.
  const dataKey = JSON.stringify(data);
  const stableData = useMemo(() => JSON.parse(dataKey) as GanttData, [dataKey]);
  // Collapse state is ours, not SVAR's: SVAR may rebuild its store (resize, panel, data) and would reopen everything.
  const collapseKey = `pp-light:gantt-collapsed:${projectKey}`;
  const [collapsed, setCollapsed] = useState<string[]>(() => {
    try { return JSON.parse(readStorage(collapseKey) ?? "[]") as string[]; } catch { return []; }
  });
  const chart = useMemo(() => toChartData(stableData, projectKey, new Set(collapsed)), [stableData, projectKey, collapsed]);
  const taskById = useMemo(() => new Map(stableData.tasks.map((task) => [task.id, task])), [stableData]);
  const scale = useMemo(() => scalesFor(zoom), [zoom]);
  const [today] = useState(() => isoDate(new Date()));
  const Theme = resolvedTheme === "dark" ? WillowDark : Willow;

  // SVAR calls `init` once; its handlers read the latest server data and rights through these refs.
  const live = useRef({ taskById, canEdit, taskHref, router, collapseKey });
  useEffect(() => {
    live.current = { taskById, canEdit, taskHref, router, collapseKey };
  });

  useEffect(() => {
    const raw = readStorage(noticeKey);
    removeStorage(noticeKey);
    if (raw) {
      try { showNotice(JSON.parse(raw) as Notice); } catch { /* old tab data */ }
    }
  }, []);

  function changeZoom(value: Zoom) {
    setZoom(value);
    writeStorage(zoomKey, value);
  }

  const saveDates = useCallback(async (id: string, start: Date, end: Date) => {
    const original = live.current.taskById.get(id);
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
    writeStorage(noticeKey, JSON.stringify(notice));
    window.location.reload();
  }, []);

  const init = useCallback((ganttApi: IApi) => {
    for (const action of ["add-task", "delete-task", "move-task", "add-link", "delete-link", "copy-task", "indent-task", "reorder-task"]) {
      ganttApi.intercept(action, () => false);
    }
    ganttApi.intercept("drag-task", (event) => {
      if (!live.current.canEdit || busy.current || String(event.id).startsWith("phase:") || String(event.id).startsWith("milestone:")) return false;
      if (event.top !== undefined) return false;
    });
    ganttApi.intercept("update-task", (event) => {
      if (!live.current.taskById.has(String(event.id))) return event.eventSource === "update-task" ? undefined : false;
      if (!live.current.canEdit || busy.current) return false;
      if (!event.task.start && !event.task.end) return false;
    });
    ganttApi.on("open-task", (event) => {
      const id = String(event.id);
      setCollapsed((previous) => {
        const next = event.mode ? previous.filter((item) => item !== id) : [...new Set([...previous, id])];
        writeStorage(live.current.collapseKey, JSON.stringify(next));
        return next;
      });
    });
    ganttApi.on("update-task", (event) => {
      if (event.inProgress || !live.current.taskById.has(String(event.id))) return;
      const task = ganttApi.getTask(event.id);
      if (task.start instanceof Date && task.end instanceof Date) void saveDates(String(event.id), task.start, task.end);
    });
  }, [saveDates]);

  const highlightTime = useCallback(
    (date: Date, unit: string) =>
      unit === "day"
        ? [[0, 6].includes(date.getDay()) ? "wx-weekend" : "", isoDate(date) === today ? "pp-gantt-today" : ""].filter(Boolean).join(" ")
        : "",
    [today],
  );

  const onSelectTask = useCallback((event: { id: string | number }) => {
    const id = String(event.id);
    if (live.current.taskById.has(id)) live.current.router.push(live.current.taskHref(id));
  }, []);

  if (!mounted) return <div className="rounded-md border p-6 text-sm text-muted-foreground">Zeitplan wird geladen…</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Zeitplan</h2>
          <p className="text-xs text-muted-foreground">Aufgaben ziehen oder am Rand verlängern. Termine folgen Arbeitstagen.</p>
        </div>
        <div className="flex items-center gap-1" role="group" aria-label="Gantt-Zoom">
          {(["Tag", "Woche", "Monat"] as const).map((value) => (
            <Button key={value} size="sm" variant={zoom === value ? "default" : "outline"} aria-pressed={zoom === value}
              onClick={() => changeZoom(value)}>{value}</Button>
          ))}
        </div>
      </div>
      {saving && <p role="status" className="text-sm">Termin wird gespeichert…</p>}
      <div className="md:hidden rounded-md border p-4 text-sm text-muted-foreground">
        Der Zeitplan ist ab Tablet-Breite verfügbar. Die Aufgaben findest du in der Listenansicht.
      </div>
      <div className="hidden md:block">
        {chart.tasks.length ? (
          <div className="pp-gantt overflow-hidden rounded-lg border" style={{ height: Math.min(570, Math.max(280, 145 + chart.tasks.length * 38)) }} aria-label="Gantt-Zeitplan">
            <Theme fonts={false}>
              <Gantt key={zoom} tasks={chart.tasks} links={chart.links} columns={columns} scales={scale.scales}
                cellWidth={scale.cellWidth} gridWidth={610} zoom={false} readonly={!canEdit}
                highlightTime={highlightTime}
                init={init}
                onSelectTask={onSelectTask} />
            </Theme>
          </div>
        ) : <div className="rounded-md border p-6 text-sm text-muted-foreground">Noch keine Aufgaben mit Start und Fälligkeit.</div>}
      </div>
      {chart.unscheduled.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-medium">Ohne vollständigen Termin</h3>
          <ul className="flex flex-wrap gap-2">
            {chart.unscheduled.map((task) => <li key={task.id}>
              <Link href={taskHref(task.id)} className="inline-block rounded-md border px-3 py-1.5 text-sm hover:bg-accent">
                {projectKey}-{task.number} {task.title}
              </Link>
            </li>)}
          </ul>
        </section>
      )}
    </div>
  );
}
