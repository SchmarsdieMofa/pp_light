import { Bell, CalendarDays } from "lucide-react";
import Link from "next/link";
import { MyWorkList } from "@/components/my-work/my-work-list";
import { QuickCapture } from "@/components/my-work/quick-capture";
import { WithTaskPanel } from "@/components/tasks/task-panel";
import { longDate } from "@/lib/calendar";
import { APP_TIME_ZONE, todayInZone } from "@/lib/dates";
import { greeting, groupMyWork } from "@/lib/my-work";
import { projectColors } from "@/lib/project-colors";
import { normalizeSearchParams } from "@/lib/urls";
import { requireActor } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { listCapturableProjects, listMyWork } from "@/server/my-work/service";
import { listNotifications } from "@/server/notifications/service";
import { listProjectsForUser } from "@/server/projects/service";

export default async function HomePage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await requireActor();
  const params = normalizeSearchParams(await props.searchParams);
  const [tasks, notifications, projects, capturable] = await Promise.all([
    listMyWork(db(), actor),
    listNotifications(db(), actor, 20),
    listProjectsForUser(db(), actor),
    listCapturableProjects(db(), actor),
  ]);
  const today = todayInZone();
  const groups = groupMyWork(tasks, today);
  const colorOf = projectColors(projects);
  const unread = notifications.filter((n) => !n.readAt).slice(0, 5);
  const firstName = actor.name.split(" ")[0];
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: APP_TIME_ZONE })
      .formatToParts(new Date())
      .find((part) => part.type === "hour")?.value ?? 12,
  );

  const summary = [
    { count: groups.overdue.length, label: "überfällig", tone: "text-destructive" },
    { count: groups.today.length, label: "heute", tone: "text-amber-600 dark:text-amber-400" },
    { count: groups.week.length, label: "diese Woche", tone: "" },
  ].filter((s) => s.count > 0);

  return (
    <WithTaskPanel taskId={params.task}>
      <div className="mx-auto grid w-full max-w-5xl gap-8 p-4 sm:p-6 lg:grid-cols-[minmax(0,1fr)_17rem]">
        <div className="min-w-0 space-y-6">
          <header>
            <p className="text-sm text-muted-foreground">{longDate(today)}</p>
            <h1 className="sr-only">Meine Arbeit</h1>
            <p className="text-2xl font-semibold" aria-hidden>{greeting(hour)}, {firstName}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {summary.length === 0
                ? "Für heute steht nichts Dringendes an."
                : summary.map((s, i) => (
                    <span key={s.label}>
                      {i > 0 && " · "}
                      <span className={`font-medium ${s.tone}`}>{s.count}</span> {s.label}
                    </span>
                  ))}
            </p>
          </header>
          <QuickCapture projects={capturable} today={today} />
          <MyWorkList
            groups={groups}
            today={today}
            colorOf={Object.fromEntries(projects.map((p) => [p.id, colorOf(p.id)]))}
          />
        </div>

        <aside className="space-y-4 lg:pt-14">
          <section aria-label="Neue Benachrichtigungen" className="rounded-xl border bg-card">
            <div className="flex items-center justify-between border-b px-4 py-2.5">
              <h2 className="flex items-center gap-2 text-sm font-medium"><Bell className="size-4 text-muted-foreground" aria-hidden /> Neu für dich</h2>
              <Link href="/inbox" className="text-xs text-muted-foreground hover:text-foreground">Alle</Link>
            </div>
            {unread.length === 0 ? (
              <p className="px-4 py-3 text-sm text-muted-foreground">Keine neuen Benachrichtigungen.</p>
            ) : (
              <ul className="divide-y text-sm">
                {unread.map((n) => (
                  <li key={n.id} className="px-4 py-2.5 [overflow-wrap:anywhere]">
                    {n.taskId ? <Link href={`/?task=${n.taskId}`} scroll={false} className="line-clamp-2 hover:underline">{n.message}</Link> : n.message}
                  </li>
                ))}
              </ul>
            )}
          </section>
          <Link href="/calendar" className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3 text-sm transition-colors hover:bg-muted/50">
            <CalendarDays className="size-4 text-muted-foreground" aria-hidden />
            <span className="flex-1">
              <span className="block font-medium">Kalender</span>
              <span className="block text-xs text-muted-foreground">Termine aller Projekte planen</span>
            </span>
          </Link>
        </aside>
      </div>
    </WithTaskPanel>
  );
}
