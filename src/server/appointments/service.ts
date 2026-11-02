import { and, asc, eq, exists, gt, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { z } from "zod";
import { addDays } from "@/lib/dates";
import { appointmentInstant, appointmentSchema, type AppointmentInput } from "@/lib/schemas/appointment";
import type { DB } from "@/server/db/client";
import { appointments, projectAccess, projects, taskAssignees, tasks } from "@/server/db/schema";
import { DomainError } from "@/server/errors";
import { assertCan, can, projectCtx, type Actor } from "@/server/permissions";
import { requireProjectAccess } from "@/server/projects/service";

export type AppointmentRow = {
  id: string; projectId: string; projectName: string; key: string;
  taskId: string | null; taskPath: string | null; taskTitle: string | null;
  title: string; startsAt: string; endsAt: string; location: string; canEdit: boolean;
};

export async function saveAppointment(db: DB, actor: Actor, raw: AppointmentInput, id?: string) {
  const input = appointmentSchema.parse(raw);
  if (id) z.uuid().parse(id);
  const access = await requireProjectAccess(db, actor, input.projectId);
  assertCan(actor, "task.update", projectCtx(access.role));
  return db.transaction(async (tx) => {
    if (input.taskId) {
      const [task] = await tx.select({ projectId: tasks.projectId }).from(tasks).where(eq(tasks.id, input.taskId));
      if (!task || task.projectId !== input.projectId) throw new DomainError("VALIDATION", "Die Aufgabe gehört nicht zu diesem Projekt.");
    }
    const values = { ...input, startsAt: appointmentInstant(input.startsAt), endsAt: appointmentInstant(input.endsAt) };
    if (id) {
      const [updated] = await tx.update(appointments).set(values)
        .where(and(eq(appointments.id, id), eq(appointments.projectId, input.projectId))).returning();
      if (!updated) throw new DomainError("NOT_FOUND", "Termin nicht gefunden.");
      return updated;
    }
    const [created] = await tx.insert(appointments).values({ ...values, createdBy: actor.id }).returning();
    return created;
  });
}

export async function deleteAppointment(db: DB, actor: Actor, id: string) {
  z.uuid().parse(id);
  const [row] = await db.select().from(appointments).where(eq(appointments.id, id));
  if (!row) throw new DomainError("NOT_FOUND", "Termin nicht gefunden.");
  const access = await requireProjectAccess(db, actor, row.projectId);
  assertCan(actor, "task.delete", projectCtx(access.role));
  await db.delete(appointments).where(eq(appointments.id, id));
}

export async function listAppointments(db: DB, actor: Actor, filter: {
  projectId?: string; taskId?: string; projectIds?: string[]; from?: string; to?: string; mine?: boolean;
} = {}): Promise<AppointmentRow[]> {
  if (filter.projectId) await requireProjectAccess(db, actor, filter.projectId);
  const rows = await db.select({ appointment: appointments, projectName: projects.name, key: projects.key,
    role: projectAccess.role, archivedAt: projects.archivedAt, taskPath: tasks.path, taskTitle: tasks.title })
    .from(appointments)
    .innerJoin(projects, eq(projects.id, appointments.projectId))
    .innerJoin(projectAccess, and(eq(projectAccess.projectId, appointments.projectId), eq(projectAccess.userId, actor.id)))
    .leftJoin(tasks, eq(tasks.id, appointments.taskId))
    .where(and(
      filter.projectId ? eq(appointments.projectId, filter.projectId) : isNull(projects.archivedAt),
      filter.taskId ? eq(appointments.taskId, filter.taskId) : undefined,
      filter.projectIds?.length ? inArray(appointments.projectId, filter.projectIds) : undefined,
      filter.from ? gt(appointments.endsAt, appointmentInstant(`${filter.from}T00:00`)) : undefined,
      filter.to ? lt(appointments.startsAt, appointmentInstant(`${addDays(filter.to, 1)}T00:00`)) : undefined,
      filter.mine ? or(eq(appointments.createdBy, actor.id), exists(db.select({ one: sql`1` }).from(taskAssignees)
        .where(and(eq(taskAssignees.taskId, appointments.taskId), eq(taskAssignees.userId, actor.id))))) : undefined,
    )).orderBy(asc(appointments.startsAt), asc(appointments.title));
  return rows.map(({ appointment, projectName, key, role, archivedAt, taskPath, taskTitle }) => ({
    id: appointment.id, projectId: appointment.projectId, taskId: appointment.taskId,
    title: appointment.title, location: appointment.location, projectName, key, taskPath, taskTitle,
    startsAt: appointment.startsAt.toISOString(), endsAt: appointment.endsAt.toISOString(),
    canEdit: can(actor, "task.update", projectCtx(archivedAt ? "readonly" : role)),
  }));
}
