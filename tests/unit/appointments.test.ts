import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { appointmentCalendarEntries } from "@/lib/appointment-calendar";
import { appointmentInstant, appointmentLocalTime, appointmentSchema } from "@/lib/schemas/appointment";
import { deleteAppointment, listAppointments, saveAppointment } from "@/server/appointments/service";
import { tasks } from "@/server/db/schema";
import { archiveProject } from "@/server/projects/lifecycle";
import { getTaskDetail } from "@/server/tasks/queries";
import { setTaskAssignees } from "@/server/tasks/relations";
import { createTask } from "@/server/tasks/service";
import { resetDb, testDb } from "../helpers/db";
import { addMember, makeActor, makeProject } from "../helpers/fixtures";

const input = { title: "Besprechung", startsAt: "2026-10-05T09:00", endsAt: "2026-10-05T10:00", location: "Raum 1" };

describe("appointment times", () => {
  it("uses Berlin offsets in summer and winter and rejects invalid dates, DST gaps and reversed times", () => {
    expect(appointmentInstant("2026-07-01T09:00").toISOString()).toBe("2026-07-01T07:00:00.000Z");
    expect(appointmentInstant("2026-01-01T09:00").toISOString()).toBe("2026-01-01T08:00:00.000Z");
    expect(appointmentLocalTime("2026-01-01T08:00:00Z")).toBe("2026-01-01T09:00");
    const base = { ...input, projectId: "00000000-0000-4000-8000-000000000001" };
    for (const startsAt of ["2026-02-30T09:00", "2026-03-29T02:30", "2026-10-05T25:00", "bad"]) {
      expect(appointmentSchema.safeParse({ ...base, startsAt }).success).toBe(false);
    }
    expect(appointmentSchema.safeParse({ ...base, endsAt: base.startsAt }).success).toBe(false);
    expect(appointmentSchema.safeParse({ ...base, title: " " }).success).toBe(false);
  });
});

describe("appointments", () => {
  beforeEach(resetDb);

  async function setup() {
    const owner = await makeActor("owner@example.com");
    const member = await makeActor("member@example.com");
    const guest = await makeActor("guest@example.com");
    const outsider = await makeActor("outsider@example.com", "admin");
    const p = await makeProject(owner, "APT");
    await addMember(p.project.id, member, "member");
    await addMember(p.project.id, guest, "guest");
    const task = await createTask(testDb, owner, { projectId: p.project.id, title: "Vorbereitung" });
    return { owner, member, guest, outsider, p, task };
  }

  it("creates project and task appointments, edits them and exposes the correct task detail", async () => {
    const { owner, member, guest, p, task } = await setup();
    const project = await saveAppointment(testDb, owner, { ...input, projectId: p.project.id });
    const linked = await saveAppointment(testDb, member, { ...input, projectId: p.project.id, taskId: task.id });
    expect((await listAppointments(testDb, guest, { projectId: p.project.id }))).toHaveLength(2);
    expect((await getTaskDetail(testDb, member, task.id))?.appointments.map((a) => a.id)).toEqual([linked.id]);
    await saveAppointment(testDb, member, { ...input, projectId: p.project.id, title: "Neu", startsAt: "2026-10-06T09:00", endsAt: "2026-10-06T10:00" }, project.id);
    expect((await listAppointments(testDb, owner, { from: "2026-10-06", to: "2026-10-06" })).map((a) => a.title)).toEqual(["Neu"]);
    await deleteAppointment(testDb, member, project.id);
    expect((await listAppointments(testDb, owner))).toHaveLength(1);
  });

  it("blocks guests and outsiders from writing and prevents cross-project task links and id substitution", async () => {
    const { owner, guest, outsider, p, task } = await setup();
    const row = await saveAppointment(testDb, owner, { ...input, projectId: p.project.id });
    for (const actor of [guest, outsider]) {
      await expect(saveAppointment(testDb, actor, { ...input, projectId: p.project.id })).rejects.toBeDefined();
      await expect(saveAppointment(testDb, actor, { ...input, projectId: p.project.id }, row.id)).rejects.toBeDefined();
      await expect(deleteAppointment(testDb, actor, row.id)).rejects.toBeDefined();
    }
    expect(await listAppointments(testDb, outsider)).toEqual([]);
    expect((await listAppointments(testDb, guest))[0].canEdit).toBe(false);
    const other = await makeProject(outsider, "OTHER");
    await expect(saveAppointment(testDb, outsider, { ...input, projectId: other.project.id, taskId: task.id })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(saveAppointment(testDb, outsider, { ...input, projectId: other.project.id }, row.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("respects project and mine filters, including task assignees, and archived projects", async () => {
    const { owner, member, p, task } = await setup();
    await saveAppointment(testDb, owner, { ...input, projectId: p.project.id });
    const linked = await saveAppointment(testDb, owner, { ...input, projectId: p.project.id, taskId: task.id });
    await setTaskAssignees(testDb, owner, task.id, [member.id]);
    expect((await listAppointments(testDb, member, { mine: true })).map((a) => a.id)).toEqual([linked.id]);
    const other = await makeProject(owner, "FILTER");
    expect(await listAppointments(testDb, owner, { projectIds: [other.project.id] })).toEqual([]);
    await archiveProject(testDb, owner, p.project.id);
    expect(await listAppointments(testDb, owner)).toEqual([]);
    expect((await listAppointments(testDb, owner, { projectId: p.project.id }))[0].canEdit).toBe(false);
    await expect(saveAppointment(testDb, owner, { ...input, projectId: p.project.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(deleteAppointment(testDb, owner, linked.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("includes overlapping days, excludes a midnight end, and cascades task deletion", async () => {
    const { owner, p, task } = await setup();
    const row = await saveAppointment(testDb, owner, { ...input, projectId: p.project.id, taskId: task.id, startsAt: "2026-10-24T23:00", endsAt: "2026-10-26T00:00" });
    const rows = await listAppointments(testDb, owner, { from: "2026-10-25", to: "2026-10-25" });
    expect(rows.map((a) => a.id)).toEqual([row.id]);
    expect(appointmentCalendarEntries(rows, "2026-10-24", "2026-10-26").map((e) => e.dueDate)).toEqual(["2026-10-24", "2026-10-25"]);
    expect(await listAppointments(testDb, owner, { from: "2026-10-26", to: "2026-10-26" })).toEqual([]);
    await saveAppointment(testDb, owner, { ...input, projectId: p.project.id });
    await testDb.delete(tasks).where(eq(tasks.id, task.id));
    expect((await listAppointments(testDb, owner))).toHaveLength(1);
  });
});
