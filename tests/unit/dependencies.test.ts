import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { listActivity } from "@/server/activity/service";
import { taskDependencies, tasks } from "@/server/db/schema";
import { addDependency, previewDependency, removeDependency, updateDependencyLag } from "@/server/dependencies/service";
import { undoScheduleGroup } from "@/server/dependencies/undo";
import { createTask, updateTask } from "@/server/tasks/service";
import { resetDb, testDb } from "../helpers/db";
import { addMember, makeActor, makeProject } from "../helpers/fixtures";

async function datedTask(actor: Awaited<ReturnType<typeof makeActor>>, projectId: string, title: string, startDate: string, dueDate: string, statusId?: string) {
  const task = await createTask(testDb, actor, { projectId, title, statusId });
  return updateTask(testDb, actor, task.id, task.updatedAt.toISOString(), { startDate, dueDate });
}

async function dates(id: string) {
  const [row] = await testDb.select({ startDate: tasks.startDate, dueDate: tasks.dueDate }).from(tasks).where(eq(tasks.id, id));
  return row;
}

describe("task dependencies", () => {
  beforeEach(resetDb);

  it("cascades business-day shifts with lag and preserves duration", async () => {
    const actor = await makeActor("cascade@example.com");
    const { project } = await makeProject(actor, "CAS");
    const a = await datedTask(actor, project.id, "A", "2026-10-01", "2026-10-02");
    const b = await datedTask(actor, project.id, "B", "2026-10-02", "2026-10-06");
    const c = await datedTask(actor, project.id, "C", "2026-10-06", "2026-10-07");
    await addDependency(testDb, actor, b.id, c.id, 0);
    const result = await addDependency(testDb, actor, a.id, b.id, 1);
    expect(result.movedCount).toBe(2);
    expect(await dates(b.id)).toEqual({ startDate: "2026-10-06", dueDate: "2026-10-08" });
    expect(await dates(c.id)).toEqual({ startDate: "2026-10-09", dueDate: "2026-10-12" });
    const unchanged = await updateDependencyLag(testDb, actor, a.id, b.id, 0);
    expect(unchanged.movedCount).toBe(0);
    expect(await dates(b.id)).toEqual({ startDate: "2026-10-06", dueDate: "2026-10-08" });
    await removeDependency(testDb, actor, a.id, b.id);
    expect(await dates(b.id)).toEqual({ startDate: "2026-10-06", dueDate: "2026-10-08" });
  });

  it("previews the shifts without saving anything", async () => {
    const actor = await makeActor("preview@example.com");
    const { project } = await makeProject(actor, "PRV");
    const a = await datedTask(actor, project.id, "A", "2026-10-01", "2026-10-02");
    const b = await datedTask(actor, project.id, "B", "2026-10-02", "2026-10-06");
    const moves = await previewDependency(testDb, actor, a.id, b.id, 1);
    expect(moves).toMatchObject([{ id: b.id, key: "PRV", title: "B", before: { startDate: "2026-10-02" }, after: { startDate: "2026-10-06", dueDate: "2026-10-08" } }]);
    expect(await dates(b.id)).toEqual({ startDate: "2026-10-02", dueDate: "2026-10-06" });
    expect(await testDb.select().from(taskDependencies)).toEqual([]);
  });

  it("rejects dependencies between a task and its own subtask", async () => {
    const actor = await makeActor("family@example.com");
    const { project } = await makeProject(actor, "FAM");
    const parent = await createTask(testDb, actor, { projectId: project.id, title: "Eltern" });
    const child = await createTask(testDb, actor, { projectId: project.id, title: "Kind", parentId: parent.id });
    await expect(addDependency(testDb, actor, child.id, parent.id, 0)).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(addDependency(testDb, actor, parent.id, child.id, 0)).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("rejects cycles, duplicates and cross-project edges", async () => {
    const actor = await makeActor("cycle@example.com");
    const { project } = await makeProject(actor, "CYC");
    const other = await makeProject(actor, "OTH");
    const a = await createTask(testDb, actor, { projectId: project.id, title: "A" });
    const b = await createTask(testDb, actor, { projectId: project.id, title: "B" });
    const c = await createTask(testDb, actor, { projectId: project.id, title: "C" });
    const foreign = await createTask(testDb, actor, { projectId: other.project.id, title: "F" });
    await addDependency(testDb, actor, a.id, b.id, 0);
    await addDependency(testDb, actor, b.id, c.id, 0);
    await expect(addDependency(testDb, actor, c.id, a.id, 0)).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(addDependency(testDb, actor, a.id, b.id, 0)).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(addDependency(testDb, actor, a.id, a.id, 0)).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(addDependency(testDb, actor, foreign.id, a.id, 0)).rejects.toMatchObject({ code: "VALIDATION" });
    expect(await testDb.select().from(taskDependencies)).toHaveLength(2);
  });

  it("leaves completed and undated successors alone and enforces permissions", async () => {
    const actor = await makeActor("owner@example.com");
    const guest = await makeActor("guest@example.com");
    const { project, done } = await makeProject(actor, "FIN");
    await addMember(project.id, guest, "guest");
    const a = await datedTask(actor, project.id, "A", "2026-10-01", "2026-10-09");
    const complete = await datedTask(actor, project.id, "B", "2026-10-01", "2026-10-02", done.id);
    const undated = await createTask(testDb, actor, { projectId: project.id, title: "C" });
    await expect(addDependency(testDb, guest, a.id, complete.id, 0)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await addDependency(testDb, actor, a.id, complete.id, 0)).movedCount).toBe(0);
    expect((await addDependency(testDb, actor, a.id, undated.id, 0)).movedCount).toBe(0);
    expect(await dates(complete.id)).toEqual({ startDate: "2026-10-01", dueDate: "2026-10-02" });
  });

  it("cascades a changed due date through a diamond and never pulls tasks forward", async () => {
    const actor = await makeActor("reschedule@example.com");
    const { project } = await makeProject(actor, "DIA");
    const a = await datedTask(actor, project.id, "A", "2026-10-01", "2026-10-02");
    const b = await datedTask(actor, project.id, "B", "2026-10-05", "2026-10-05");
    const c = await datedTask(actor, project.id, "C", "2026-10-05", "2026-10-06");
    const d = await datedTask(actor, project.id, "D", "2026-10-07", "2026-10-08");
    await addDependency(testDb, actor, a.id, b.id, 0);
    await addDependency(testDb, actor, a.id, c.id, 0);
    await addDependency(testDb, actor, b.id, d.id, 0);
    await addDependency(testDb, actor, c.id, d.id, 0);

    const later = await updateTask(testDb, actor, a.id, a.updatedAt.toISOString(), { dueDate: "2026-10-06" });
    expect(later.schedule?.movedCount).toBe(3);
    expect(await dates(b.id)).toEqual({ startDate: "2026-10-07", dueDate: "2026-10-07" });
    expect(await dates(c.id)).toEqual({ startDate: "2026-10-07", dueDate: "2026-10-08" });
    expect(await dates(d.id)).toEqual({ startDate: "2026-10-09", dueDate: "2026-10-12" });

    const earlier = await updateTask(testDb, actor, a.id, later.updatedAt.toISOString(), { dueDate: "2026-10-02" });
    expect(earlier.schedule?.movedCount).toBe(0);
    expect(await dates(d.id)).toEqual({ startDate: "2026-10-09", dueDate: "2026-10-12" });
  });

  it("undoes the whole date group once and rejects a later conflicting edit", async () => {
    const actor = await makeActor("undo@example.com");
    const { project } = await makeProject(actor, "UND");
    const a = await datedTask(actor, project.id, "A", "2026-10-01", "2026-10-02");
    const b = await datedTask(actor, project.id, "B", "2026-10-05", "2026-10-06");
    await addDependency(testDb, actor, a.id, b.id, 0);
    const first = await updateTask(testDb, actor, a.id, a.updatedAt.toISOString(), { dueDate: "2026-10-06" });
    expect(first.schedule?.movedCount).toBe(1);
    await undoScheduleGroup(testDb, actor, first.schedule!.groupId);
    expect(await dates(a.id)).toEqual({ startDate: "2026-10-01", dueDate: "2026-10-02" });
    expect(await dates(b.id)).toEqual({ startDate: "2026-10-05", dueDate: "2026-10-06" });
    expect((await listActivity(testDb, a.id)).at(-1)?.action).toBe("schedule.undone");
    expect((await listActivity(testDb, b.id)).at(-1)?.action).toBe("schedule.undone");
    await expect(undoScheduleGroup(testDb, actor, first.schedule!.groupId)).rejects.toMatchObject({ code: "CONFLICT" });

    const [freshA] = await testDb.select({ updatedAt: tasks.updatedAt }).from(tasks).where(eq(tasks.id, a.id));
    const second = await updateTask(testDb, actor, a.id, freshA.updatedAt.toISOString(), { dueDate: "2026-10-07" });
    const [freshB] = await testDb.select({ updatedAt: tasks.updatedAt }).from(tasks).where(eq(tasks.id, b.id));
    await updateTask(testDb, actor, b.id, freshB.updatedAt.toISOString(), { dueDate: "2026-10-12" });
    await expect(undoScheduleGroup(testDb, actor, second.schedule!.groupId)).rejects.toMatchObject({ code: "CONFLICT" });
    expect((await dates(a.id)).dueDate).toBe("2026-10-07");
  });
});
