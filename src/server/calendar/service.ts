import { byPath } from "@/server/db/order";
import { and, asc, eq, exists, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import type { TaskPriority } from "@/lib/enums";
import type { DB } from "@/server/db/client";
import { projectMembers, projects, statuses, taskAssignees, tasks } from "@/server/db/schema";
import type { Actor } from "@/server/permissions";

export type CalendarTask = {
  id: string;
  projectId: string;
  projectName: string;
  key: string;
  path: string;
  title: string;
  dueDate: string;
  priority: TaskPriority;
  statusName: string;
  isDone: boolean;
  updatedAt: string;
  /** Whether the actor may reschedule it (admins, owners and members – not guests). */
  canEdit: boolean;
};

export type CalendarFilter = {
  /** Inclusive ISO day range of due dates. */
  from: string;
  to: string;
  /** Only these projects; empty = all visible ones. */
  projectIds?: string[];
  /** Only tasks assigned to the actor. */
  mine?: boolean;
  includeDone?: boolean;
  /** Also open tasks due before `from` (overdue backlog for the agenda). */
  overdueBefore?: string;
};

/** Tasks with a due date in the range, across all active projects the actor can see. */
export async function listCalendarTasks(db: DB, actor: Actor, filter: CalendarFilter): Promise<CalendarTask[]> {
  const membership = db
    .select({ one: sql`1` })
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, tasks.projectId), eq(projectMembers.userId, actor.id)));
  const editorMembership = db
    .select({ one: sql`1` })
    .from(projectMembers)
    .where(and(
      eq(projectMembers.projectId, tasks.projectId),
      eq(projectMembers.userId, actor.id),
      inArray(projectMembers.role, ["owner", "member"]),
    ));
  const inRange = and(gte(tasks.dueDate, filter.from), lte(tasks.dueDate, filter.to));
  const dateCondition = filter.overdueBefore
    ? sql`(${inRange} or (${tasks.dueDate} < ${filter.overdueBefore} and not ${statuses.isDone}))`
    : inRange;

  const rows = await db
    .select({
      id: tasks.id,
      projectId: tasks.projectId,
      projectName: projects.name,
      key: projects.key,
      path: tasks.path,
      title: tasks.title,
      dueDate: tasks.dueDate,
      priority: tasks.priority,
      statusName: statuses.name,
      isDone: statuses.isDone,
      updatedAt: tasks.updatedAt,
      canEdit: sql<boolean>`exists(${editorMembership})`,
    })
    .from(tasks)
    .innerJoin(statuses, eq(statuses.id, tasks.statusId))
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .where(and(
      isNull(projects.archivedAt),
      exists(membership),
      dateCondition,
      filter.projectIds?.length ? inArray(tasks.projectId, filter.projectIds) : undefined,
      filter.includeDone ? undefined : eq(statuses.isDone, false),
      filter.mine
        ? exists(db.select({ one: sql`1` }).from(taskAssignees)
            .where(and(eq(taskAssignees.taskId, tasks.id), eq(taskAssignees.userId, actor.id))))
        : undefined,
    ))
    .orderBy(asc(tasks.dueDate), asc(projects.key), asc(byPath(tasks.path)));

  return rows.map((row) => ({ ...row, dueDate: row.dueDate!, updatedAt: row.updatedAt.toISOString() }));
}
