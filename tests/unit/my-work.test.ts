import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { statuses } from "@/server/db/schema";
import { removeMember } from "@/server/members/service";
import { completeTask, createMyTask, listCapturableProjects, listMyWork, reopenTask } from "@/server/my-work/service";
import { getTaskDetail } from "@/server/tasks/queries";
import { setTaskAssignees } from "@/server/tasks/relations";
import { createTask, updateTask } from "@/server/tasks/service";
import { resetDb, testDb } from "../helpers/db";
import { addMember, makeActor, makeProject } from "../helpers/fixtures";

async function setup() {
  const ada = await makeActor("ada@example.com");
  const mia = await makeActor("mia@example.com");
  const a = await makeProject(ada, "MWA");
  const b = await makeProject(ada, "MWB");
  await addMember(a.project.id, mia, "member");
  await addMember(b.project.id, mia, "member");
  const t1 = await createTask(testDb, ada, { projectId: a.project.id, title: "Eins" });
  const t2 = await createTask(testDb, ada, { projectId: b.project.id, title: "Zwei" });
  const t3 = await createTask(testDb, ada, { projectId: a.project.id, title: "Fremd zugewiesen" });
  const t4 = await createTask(testDb, ada, { projectId: a.project.id, title: "Schon erledigt" });
  for (const t of [t1, t2, t4]) await setTaskAssignees(testDb, ada, t.id, [mia.id]);
  await setTaskAssignees(testDb, ada, t3.id, [ada.id]);
  const due = await updateTask(testDb, ada, t1.id, t1.updatedAt.toISOString(), { dueDate: "2026-10-14" });
  await updateTask(testDb, ada, t4.id, t4.updatedAt.toISOString(), { statusId: a.done.id });
  return { ada, mia, a, b, t1: due, t2, t3, t4 };
}

describe("my work", () => {
  beforeEach(resetDb);

  it("lists my open assigned tasks across projects", async () => {
    const { mia } = await setup();
    const rows = await listMyWork(testDb, mia);
    expect(rows.map((r) => [`${r.key}-${r.path}`, r.title, r.dueDate])).toEqual([
      ["MWA-1", "Eins", "2026-10-14"],
      ["MWB-1", "Zwei", null],
    ]);
    expect(rows[0]).toMatchObject({ projectName: "Projekt MWA", statusName: "Offen" });
  });

  it("drops tasks of projects I was removed from", async () => {
    const { ada, mia, b } = await setup();
    await removeMember(testDb, ada, b.project.id, mia.id);
    expect((await listMyWork(testDb, mia)).map((r) => r.title)).toEqual(["Eins"]);
  });

  it("completes a task into the project's done column", async () => {
    const { ada, mia, t1, a } = await setup();
    await completeTask(testDb, mia, t1.id);
    expect((await getTaskDetail(testDb, ada, t1.id))?.statusId).toBe(a.done.id);
    expect((await listMyWork(testDb, mia)).map((r) => r.title)).toEqual(["Zwei"]);
  });

  it("refuses guests and projects without a done column", async () => {
    const { ada, t2, b } = await setup();
    const gast = await makeActor("gast@example.com");
    await addMember(b.project.id, gast, "guest");
    await expect(completeTask(testDb, gast, t2.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await testDb.update(statuses).set({ isDone: false }).where(eq(statuses.projectId, b.project.id));
    await expect(completeTask(testDb, ada, t2.id)).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("reopens a done task into the first open column", async () => {
    const { ada, a, t4 } = await setup();
    await reopenTask(testDb, ada, t4.id);
    expect((await getTaskDetail(testDb, ada, t4.id))?.statusId).toBe(a.open.id);
  });

  it("captures a task assigned to me with a due date", async () => {
    const { mia, a } = await setup();
    const created = await createMyTask(testDb, mia, { projectId: a.project.id, title: "Schnell notiert", dueDate: "2026-10-20" });
    const mine = (await listMyWork(testDb, mia)).find((t) => t.id === created.id);
    expect(mine).toMatchObject({ title: "Schnell notiert", dueDate: "2026-10-20" });
  });

  it("refuses quick capture where I cannot be assignee and creates nothing", async () => {
    const { a } = await setup();
    const root = await makeActor("root@example.com", "admin");
    await expect(createMyTask(testDb, root, { projectId: a.project.id, title: "Waise", dueDate: null })).rejects.toMatchObject({ code: "VALIDATION" });
    expect((await listMyWork(testDb, root)).length).toBe(0);
    expect((await listCapturableProjects(testDb, root)).length).toBe(0);
  });
});
