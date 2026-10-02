import { CalendarView, type CalendarViewMode } from "@/components/calendar/calendar-view";
import { WithTaskPanel } from "@/components/tasks/task-panel";
import { monthGrid } from "@/lib/calendar";
import { addDays, parseDateInput, todayInZone, weekStart } from "@/lib/dates";
import { normalizeSearchParams } from "@/lib/urls";
import { requireActor } from "@/server/auth/session";
import { listCalendarTasks } from "@/server/calendar/service";
import { db } from "@/server/db/client";
import { listProjectsForUser } from "@/server/projects/service";

const VIEWS: CalendarViewMode[] = ["month", "week", "list"];
/** Days the agenda shows from its anchor on. */
const AGENDA_DAYS = 28;

export default async function CalendarPage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await requireActor();
  const params = normalizeSearchParams(await props.searchParams);
  const today = todayInZone();
  const view = VIEWS.find((v) => v === params.view) ?? "month";
  const anchor = (params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) && parseDateInput(params.date)) || today;

  const [from, to] =
    view === "month"
      ? (() => { const grid = monthGrid(anchor.slice(0, 7)); return [grid[0], grid[41]]; })()
      : view === "week"
        ? [weekStart(anchor), addDays(weekStart(anchor), 6)]
        : [anchor, addDays(anchor, AGENDA_DAYS - 1)];

  const projects = await listProjectsForUser(db(), actor);
  const visibleIds = new Set(projects.map((p) => p.id));
  const projectIds = (params.projects ?? "").split(",").filter((id) => visibleIds.has(id));
  const tasks = await listCalendarTasks(db(), actor, {
    from,
    to,
    projectIds,
    mine: params.mine === "1",
    includeDone: params.done === "1",
    // The agenda starting today also lists what is already late – the first thing to (re)plan.
    overdueBefore: view === "list" && anchor <= today ? today : undefined,
  });

  return (
    <WithTaskPanel taskId={params.task} className="h-full">
      <CalendarView
        view={view}
        anchor={anchor}
        today={today}
        from={from}
        to={to}
        tasks={tasks}
        projects={projects.map((p) => ({ id: p.id, name: p.name, key: p.key }))}
        selectedProjectIds={projectIds}
        mine={params.mine === "1"}
        includeDone={params.done === "1"}
      />
    </WithTaskPanel>
  );
}
