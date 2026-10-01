import { and, asc, desc, eq, exists, ilike, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import type { TaskPriority } from "@/lib/enums";
import type { TaskListFilters, TaskSort } from "@/lib/task-list-params";
import { listChecklist } from "@/server/checklists/service";
import type { DB } from "@/server/db/client";
import { byPosition } from "@/server/db/order";
import {
  checklistItems,
  labels,
  projects,
  statuses,
  taskAssignees,
  taskLabels,
  tasks,
  users,
} from "@/server/db/schema";
import { DomainError } from "@/server/errors";
import { listLabels } from "@/server/labels/service";
import { can, projectCtx, type Actor } from "@/server/permissions";
import { listMembers, listStatuses } from "@/server/projects/service";
import { loadTaskAccess } from "./access";

export type TaskListRow = {
  id: string;
  number: number;
  key: string;
  title: string;
  priority: TaskPriority;
  startDate: string | null;
  dueDate: string | null;
  status: { id: string; name: string; color: string; isDone: boolean };
  assignees: { id: string; name: string }[];
  labels: { id: string; name: string; color: string }[];
  subtasks: { done: number; total: number };
  checklist: { done: number; total: number };
};

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** "QRY-12" or "12" → 12 */
function parseTaskNumber(q: string): number | undefined {
  const match = /^(?:[a-z][a-z0-9]*-)?(\d{1,9})$/i.exec(q);
  return match ? Number(match[1]) : undefined;
}

function orderFor(sort: TaskSort): SQL[] {
  const dir = sort.dir === "desc" ? desc : asc;
  switch (sort.field) {
    case "title":
      return [dir(sql`lower(${tasks.title})`), asc(tasks.number)];
    case "status":
      return [dir(byPosition(statuses.position)), asc(tasks.number)];
    case "priority":
      return [dir(tasks.priority), asc(tasks.number)];
    case "dueDate":
      return [sql`${tasks.dueDate} ${sql.raw(sort.dir === "desc" ? "desc" : "asc")} nulls last`, asc(tasks.number)];
    case "position":
      return [byPosition(statuses.position), byPosition(tasks.position), asc(tasks.number)];
    default:
      return [dir(tasks.number)];
  }
}

export async function listProjectTasks(
  db: DB,
  projectId: string,
  filters: TaskListFilters = {},
  sort: TaskSort = { field: "number", dir: "asc" },
): Promise<TaskListRow[]> {
  const conditions: (SQL | undefined)[] = [eq(tasks.projectId, projectId), isNull(tasks.parentId)];
  if (filters.statusId) conditions.push(eq(tasks.statusId, filters.statusId));
  if (filters.priority) conditions.push(eq(tasks.priority, filters.priority));
  if (filters.assigneeId) {
    conditions.push(
      exists(
        db
          .select({ one: sql`1` })
          .from(taskAssignees)
          .where(and(eq(taskAssignees.taskId, tasks.id), eq(taskAssignees.userId, filters.assigneeId))),
      ),
    );
  }
  if (filters.labelId) {
    conditions.push(
      exists(
        db
          .select({ one: sql`1` })
          .from(taskLabels)
          .where(and(eq(taskLabels.taskId, tasks.id), eq(taskLabels.labelId, filters.labelId))),
      ),
    );
  }
  if (filters.q) {
    const number = parseTaskNumber(filters.q);
    conditions.push(
      or(ilike(tasks.title, `%${escapeLike(filters.q)}%`), number !== undefined ? eq(tasks.number, number) : undefined),
    );
  }

  const base = await db
    .select({
      id: tasks.id,
      number: tasks.number,
      key: projects.key,
      title: tasks.title,
      priority: tasks.priority,
      startDate: tasks.startDate,
      dueDate: tasks.dueDate,
      status: { id: statuses.id, name: statuses.name, color: statuses.color, isDone: statuses.isDone },
    })
    .from(tasks)
    .innerJoin(statuses, eq(statuses.id, tasks.statusId))
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .where(and(...conditions))
    .orderBy(...orderFor(sort));
  if (base.length === 0) return [];

  const ids = base.map((t) => t.id);
  const [assigneeRows, labelRows, subtaskRows, checklistRows] = await Promise.all([
    db
      .select({ taskId: taskAssignees.taskId, id: users.id, name: users.name })
      .from(taskAssignees)
      .innerJoin(users, eq(users.id, taskAssignees.userId))
      .where(inArray(taskAssignees.taskId, ids))
      .orderBy(asc(users.name)),
    db
      .select({ taskId: taskLabels.taskId, id: labels.id, name: labels.name, color: labels.color })
      .from(taskLabels)
      .innerJoin(labels, eq(labels.id, taskLabels.labelId))
      .where(inArray(taskLabels.taskId, ids))
      .orderBy(asc(sql`lower(${labels.name})`)),
    db
      .select({
        parentId: tasks.parentId,
        total: sql<number>`count(*)`.mapWith(Number),
        done: sql<number>`count(*) filter (where ${statuses.isDone})`.mapWith(Number),
      })
      .from(tasks)
      .innerJoin(statuses, eq(statuses.id, tasks.statusId))
      .where(inArray(tasks.parentId, ids))
      .groupBy(tasks.parentId),
    db
      .select({
        taskId: checklistItems.taskId,
        total: sql<number>`count(*)`.mapWith(Number),
        done: sql<number>`count(*) filter (where ${checklistItems.done})`.mapWith(Number),
      })
      .from(checklistItems)
      .where(inArray(checklistItems.taskId, ids))
      .groupBy(checklistItems.taskId),
  ]);

  return base.map((t) => {
    const sub = subtaskRows.find((r) => r.parentId === t.id);
    const check = checklistRows.find((r) => r.taskId === t.id);
    return {
      ...t,
      assignees: assigneeRows.filter((r) => r.taskId === t.id).map(({ id, name }) => ({ id, name })),
      labels: labelRows.filter((r) => r.taskId === t.id).map(({ id, name, color }) => ({ id, name, color })),
      subtasks: { done: sub?.done ?? 0, total: sub?.total ?? 0 },
      checklist: { done: check?.done ?? 0, total: check?.total ?? 0 },
    };
  });
}

export type TaskDetail = {
  id: string;
  projectId: string;
  projectName: string;
  key: string;
  number: number;
  title: string;
  description: string;
  priority: TaskPriority;
  startDate: string | null;
  dueDate: string | null;
  statusId: string;
  updatedAt: string;
  canEdit: boolean;
  parent: { id: string; number: number; title: string } | null;
  statuses: { id: string; name: string; color: string; isDone: boolean }[];
  members: { id: string; name: string }[];
  labels: { id: string; name: string; color: string }[];
  assigneeIds: string[];
  labelIds: string[];
  subtasks: { id: string; number: number; title: string; isDone: boolean }[];
  checklist: { id: string; text: string; done: boolean }[];
  hintAllSubtasksDone: boolean;
};

export async function getTaskDetail(db: DB, actor: Actor, taskId: string): Promise<TaskDetail | null> {
  let access;
  try {
    access = await loadTaskAccess(db, actor, taskId);
  } catch (err) {
    if (err instanceof DomainError && err.code === "NOT_FOUND") return null;
    throw err;
  }
  const { task, role } = access;

  const [[project], statusList, members, projectLabels, assignees, taskLabelRows, subtasks, checklist, parentRows] =
    await Promise.all([
      db.select({ name: projects.name, key: projects.key }).from(projects).where(eq(projects.id, task.projectId)),
      listStatuses(db, task.projectId),
      listMembers(db, task.projectId),
      listLabels(db, task.projectId),
      db.select({ userId: taskAssignees.userId }).from(taskAssignees).where(eq(taskAssignees.taskId, task.id)),
      db.select({ labelId: taskLabels.labelId }).from(taskLabels).where(eq(taskLabels.taskId, task.id)),
      db
        .select({ id: tasks.id, number: tasks.number, title: tasks.title, isDone: statuses.isDone })
        .from(tasks)
        .innerJoin(statuses, eq(statuses.id, tasks.statusId))
        .where(eq(tasks.parentId, task.id))
        .orderBy(asc(tasks.number)),
      listChecklist(db, task.id),
      task.parentId
        ? db.select({ id: tasks.id, number: tasks.number, title: tasks.title }).from(tasks).where(eq(tasks.id, task.parentId))
        : Promise.resolve([]),
    ]);

  const currentStatus = statusList.find((s) => s.id === task.statusId);
  return {
    id: task.id,
    projectId: task.projectId,
    projectName: project.name,
    key: project.key,
    number: task.number,
    title: task.title,
    description: task.description,
    priority: task.priority,
    startDate: task.startDate,
    dueDate: task.dueDate,
    statusId: task.statusId,
    updatedAt: task.updatedAt.toISOString(),
    canEdit: can(actor, "task.update", projectCtx(role)),
    parent: parentRows[0] ?? null,
    statuses: statusList.map(({ id, name, color, isDone }) => ({ id, name, color, isDone })),
    members: members.map(({ id, name }) => ({ id, name })),
    labels: projectLabels.map(({ id, name, color }) => ({ id, name, color })),
    assigneeIds: assignees.map((a) => a.userId),
    labelIds: taskLabelRows.map((l) => l.labelId),
    subtasks,
    checklist: checklist.map(({ id, text, done }) => ({ id, text, done })),
    hintAllSubtasksDone: subtasks.length > 0 && subtasks.every((s) => s.isDone) && !currentStatus?.isDone,
  };
}
