import Link from "next/link";
import { MyWorkList } from "@/components/my-work/my-work-list";
import { todayInZone } from "@/lib/dates";
import { groupMyWork } from "@/lib/my-work";
import { requireActor } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { listMyWork } from "@/server/my-work/service";
import { listNotifications } from "@/server/notifications/service";

export default async function HomePage() {
  const actor = await requireActor();
  const [tasks, notifications] = await Promise.all([listMyWork(db(), actor), listNotifications(db(), actor, 20)]);
  const unread = notifications.filter((n) => !n.readAt).slice(0, 5);
  const firstName = actor.name.split(" ")[0];

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-6">
      <div>
        <h1 className="text-xl font-semibold">Meine Arbeit</h1>
        <p className="text-sm text-muted-foreground">Hallo {firstName} – deine offenen Aufgaben aus allen Projekten.</p>
      </div>
      <MyWorkList groups={groupMyWork(tasks, todayInZone())} />
      {unread.length > 0 && (
        <section aria-label="Neue Benachrichtigungen" className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium">Neue Benachrichtigungen</h2>
            <Link href="/inbox" className="text-xs text-muted-foreground hover:text-foreground">Alle anzeigen</Link>
          </div>
          <ul className="divide-y rounded-md border text-sm">
            {unread.map((n) => (
              <li key={n.id} className="px-3 py-2">
                {n.taskId ? <Link href={`/tasks/${n.taskId}`} className="hover:underline">{n.message}</Link> : n.message}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
