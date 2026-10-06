import { and, desc, eq, inArray, isNull, lte, not, sql } from "drizzle-orm";
import type { Executor, DB } from "@/server/db/client";
import { z } from "zod";
import { NOTIFICATION_TYPES, type NotificationType } from "@/lib/notification-types";
import {
  commentMentions, notificationPreferences, notifications, projectAccess, projects, statuses,
  taskAssignees, tasks, users,
} from "@/server/db/schema";
import { DomainError } from "@/server/errors";
import type { Actor } from "@/server/permissions";

type Event = {
  id: string;
  projectId: string;
  taskId: string | null;
  actorId: string;
  action: string;
  diff: Record<string, unknown>;
};

function stringIds(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];
}

/** Called by recordActivity with the same DB handle/transaction as the task mutation. */
export async function notifyActivity(ex: Executor, event: Event): Promise<void> {
  if (!event.taskId) return;
  const relevant = ["task.assigneesChanged", "comment.added", "task.updated", "task.moved", "task.autoMoved"];
  if (!relevant.includes(event.action)) return;
  if (event.action === "task.updated" && !Object.hasOwn(event.diff, "statusId")) return;

  const [task] = await ex.select({ title: tasks.title, path: tasks.path, createdBy: tasks.createdBy, key: projects.key })
    .from(tasks).innerJoin(projects, eq(projects.id, tasks.projectId))
    .where(eq(tasks.id, event.taskId)).limit(1);
  if (!task) return;
  const assignees = await ex.select({ userId: taskAssignees.userId }).from(taskAssignees)
    .where(eq(taskAssignees.taskId, event.taskId));
  const recipients = new Map<string, NotificationType>();
  const add = (ids: string[], type: NotificationType) => ids.forEach((id) => recipients.set(id, type));
  if (event.action === "task.assigneesChanged") add(stringIds(event.diff.added), "assigned");
  if (event.action === "task.updated" || event.action === "task.moved") add(assignees.map((a) => a.userId), "status");
  if (event.action === "task.autoMoved") add(assignees.map((a) => a.userId), "schedule");
  if (event.action === "comment.added") {
    add([task.createdBy, ...assignees.map((a) => a.userId)], "comment");
    if (typeof event.diff.commentId === "string") {
      const mentions = await ex.select({ userId: commentMentions.userId }).from(commentMentions)
        .where(eq(commentMentions.commentId, event.diff.commentId));
      add(mentions.map((m) => m.userId), "mentioned");
    }
  }
  recipients.delete(event.actorId);
  if (recipients.size === 0) return;
  const allowed = await ex.select({ id: users.id }).from(users)
    .innerJoin(projectAccess, eq(projectAccess.userId, users.id))
    .where(and(eq(users.active, true), eq(projectAccess.projectId, event.projectId), inArray(users.id, [...recipients.keys()])));
  const [actor] = await ex.select({ name: users.name }).from(users).where(eq(users.id, event.actorId)).limit(1);
  const taskName = `${task.key}-${task.path} ${task.title}`;
  const verb: Record<NotificationType, string> = {
    assigned: "hat dir die Aufgabe zugewiesen", mentioned: "hat dich erwähnt", comment: "hat kommentiert",
    status: "hat den Status geändert", schedule: "hat den Termin verschoben",
    dueSoon: "ist morgen fällig", overdue: "ist überfällig",
  };
  if (allowed.length === 0) return;
  await ex.insert(notifications).values(allowed.map(({ id }) => {
    const type = recipients.get(id)!;
    return {
      userId: id, actorId: event.actorId, projectId: event.projectId, taskId: event.taskId,
      type, message: `${actor?.name ?? "Jemand"} ${verb[type]}: ${taskName}`,
      eventKey: `${event.id}:${type}:${id}`,
    };
  })).onConflictDoNothing();
}

function visibleTo(actor: Actor) {
  return sql`(${notifications.projectId} is null or exists (select 1 from project_access pm where pm.project_id = ${notifications.projectId} and pm.user_id = ${actor.id}))`;
}

export async function listNotifications(db: DB, actor: Actor, limit = 50) {
  return db.select().from(notifications)
    .where(and(eq(notifications.userId, actor.id), visibleTo(actor)))
    .orderBy(desc(notifications.createdAt), desc(notifications.id)).limit(Math.min(Math.max(limit, 1), 100));
}

export async function unreadCount(db: DB, actor: Actor): Promise<number> {
  const [row] = await db.select({ count: sql<number>`count(*)`.mapWith(Number) }).from(notifications)
    .where(and(eq(notifications.userId, actor.id), isNull(notifications.readAt), visibleTo(actor)));
  return row.count;
}

export async function markNotificationRead(db: DB, actor: Actor, id: string): Promise<void> {
  if (!z.uuid().safeParse(id).success) throw new DomainError("NOT_FOUND", "Benachrichtigung nicht gefunden.");
  const changed = await db.update(notifications).set({ readAt: new Date() })
    .where(and(eq(notifications.id, id), eq(notifications.userId, actor.id), visibleTo(actor)))
    .returning({ id: notifications.id });
  if (changed.length === 0) throw new DomainError("NOT_FOUND", "Benachrichtigung nicht gefunden.");
}

export async function markAllNotificationsRead(db: DB, actor: Actor): Promise<void> {
  await db.update(notifications).set({ readAt: new Date() })
    .where(and(eq(notifications.userId, actor.id), isNull(notifications.readAt), visibleTo(actor)));
}

export async function getNotificationPreferences(db: DB, userId: string): Promise<NotificationType[]> {
  const [row] = await db.select().from(notificationPreferences).where(eq(notificationPreferences.userId, userId));
  return (row?.disabledEmailTypes ?? []).filter((type): type is NotificationType => NOTIFICATION_TYPES.includes(type as NotificationType));
}

export async function setNotificationPreferences(db: DB, userId: string, disabled: string[]): Promise<void> {
  if (disabled.some((type) => !NOTIFICATION_TYPES.includes(type as NotificationType))) {
    throw new DomainError("VALIDATION", "Unbekannter Benachrichtigungstyp.");
  }
  await db.insert(notificationPreferences).values({ userId, disabledEmailTypes: [...new Set(disabled)] })
    .onConflictDoUpdate({ target: notificationPreferences.userId, set: { disabledEmailTypes: [...new Set(disabled)] } });
}

function berlinDate(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/** Idempotent even when a daily job is retried: eventKey includes the Berlin calendar day. */
export async function createDueReminders(db: DB, now = new Date()): Promise<number> {
  const today = berlinDate(now);
  const next = new Date(`${today}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  const tomorrow = next.toISOString().slice(0, 10);
  const due = await db.select({ taskId: tasks.id, projectId: tasks.projectId, title: tasks.title, path: tasks.path,
    key: projects.key, dueDate: tasks.dueDate, userId: users.id })
    .from(tasks).innerJoin(statuses, eq(statuses.id, tasks.statusId))
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .innerJoin(taskAssignees, eq(taskAssignees.taskId, tasks.id))
    .innerJoin(users, eq(users.id, taskAssignees.userId))
    .innerJoin(projectAccess, and(eq(projectAccess.projectId, tasks.projectId), eq(projectAccess.userId, users.id)))
    .where(and(eq(statuses.isDone, false), eq(users.active, true), lte(tasks.dueDate, tomorrow), not(isNull(tasks.dueDate))));
  if (due.length === 0) return 0;
  const inserted = await db.insert(notifications).values(due.map((row) => {
    const type: NotificationType = row.dueDate === tomorrow ? "dueSoon" : "overdue";
    return { userId: row.userId, projectId: row.projectId, taskId: row.taskId, type,
      message: `${row.key}-${row.path} ${row.title} ${type === "dueSoon" ? "ist morgen fällig" : "ist überfällig"}.`,
      eventKey: `due:${today}:${row.taskId}:${row.userId}:${type}` };
  })).onConflictDoNothing().returning({ id: notifications.id });
  return inserted.length;
}
