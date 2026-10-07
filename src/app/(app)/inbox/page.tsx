import Link from "next/link";
import { InboxControls } from "@/components/notifications/inbox-controls";
import { requireActor } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { getNotificationPreferences, listNotifications } from "@/server/notifications/service";

export default async function InboxPage() {
  const actor = await requireActor();
  const [items, disabled] = await Promise.all([
    listNotifications(db(), actor), getNotificationPreferences(db(), actor.id),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <h1 className="text-xl font-semibold">Benachrichtigungen</h1>
        <InboxControls disabled={disabled} />
      </div>
      {items.length === 0 ? <p className="text-sm text-muted-foreground">Noch keine Benachrichtigungen.</p> : (
        <ul className="divide-y rounded-md border" aria-label="Benachrichtigungen">
          {items.map((item) => (
            <li key={item.id} className={`flex flex-col items-start justify-between gap-4 p-4 sm:flex-row ${item.readAt ? "" : "bg-primary/5"}`}>
              <div className="min-w-0 space-y-1 [overflow-wrap:anywhere]">
                {item.questionId && item.projectId ? (
                  <Link className="font-medium hover:underline" href={`/projects/${item.projectId}/questions?frage=${item.questionId}`}>{item.message}</Link>
                ) : item.taskId && item.projectId ? (
                  <Link className="font-medium hover:underline" href={`/tasks/${item.taskId}`}>{item.message}</Link>
                ) : <span className="font-medium">{item.message}</span>}
                <p className="text-xs text-muted-foreground">{item.createdAt.toLocaleString("de-DE", { timeZone: "Europe/Berlin" })}</p>
              </div>
              {!item.readAt && <InboxControls notificationId={item.id} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
