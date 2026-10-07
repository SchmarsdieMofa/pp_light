import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { listActivity } from "@/server/activity/service";
import { tasks } from "@/server/db/schema";
import { listProjectTasks } from "@/server/tasks/queries";
import { createTask, moveTask } from "@/server/tasks/service";
import { resetDb, testDb } from "../helpers/db";
import { addMember, makeActor, makeProject } from "../helpers/fixtures";

async function setup() {
  const ada = await makeActor("ada@example.com");
  const p = await makeProject(ada, "MOV");
  const a = await createTask(testDb, ada, { projectId: p.project.id, title: "A" });
  const b = await createTask(testDb, ada, { projectId: p.project.id, title: "B" });
  const c = await createTask(testDb, ada, { projectId: p.project.id, title: "C" });
  const doing = p.statuses[1];
  return { ada, ...p, a, b, c, doing };
}

async function board(projectId: string) {
  const rows = await listProjectTasks(testDb, projectId, {}, { field: "position", dir: "asc" });
  return rows.map((r) => `${r.title}:${r.status.name}`);
}

describe("moveTask", () => {
  beforeEach(resetDb);

  it("reorders within a column without touching updatedAt or the log", async () => {
    const { ada, project, a, c, open } = await setup();
    const moved = await moveTask(testDb, ada, c.id, { statusId: open.id, afterId: null, beforeId: a.id });
    expect(await board(project.id)).toEqual(["C:Offen", "A:Offen", "B:Offen"]);
    expect(moved.updatedAt.getTime()).toBe(c.updatedAt.getTime());
    expect((await listActivity(testDb, c.id)).map((e) => e.action)).toEqual(["task.created"]);
  });

  it("puts a task created with placement top before the others", async () => {
    const { ada, project } = await setup();
    await createTask(testDb, ada, { projectId: project.id, title: "Neu oben", placement: "top" });
    await createTask(testDb, ada, { projectId: project.id, title: "Neu unten" });
    expect(await board(project.id)).toEqual(["Neu oben:Offen", "A:Offen", "B:Offen", "C:Offen", "Neu unten:Offen"]);
  });

  it("moves to another column, updates status, completedAt, updatedAt and logs it", async () => {
    const { ada, project, a, done } = await setup();
    const moved = await moveTask(testDb, ada, a.id, { statusId: done.id, afterId: null, beforeId: null });
    expect(await board(project.id)).toEqual(["B:Offen", "C:Offen", "A:Fertig"]);
    expect(moved.completedAt).not.toBeNull();
    expect(moved.updatedAt.getTime()).toBeGreaterThanOrEqual(a.updatedAt.getTime());
    expect((await listActivity(testDb, a.id)).at(-1)).toMatchObject({ action: "task.moved" });
  });

  it("repairs duplicate positions instead of failing", async () => {
    const { ada, project, a, b, c, open } = await setup();
    await testDb.update(tasks).set({ position: "a1" }).where(eq(tasks.id, a.id));
    await testDb.update(tasks).set({ position: "a1" }).where(eq(tasks.id, b.id));
    await moveTask(testDb, ada, c.id, { statusId: open.id, afterId: a.id, beforeId: b.id });
    expect(await board(project.id)).toEqual(["A:Offen", "C:Offen", "B:Offen"]);
  });

  it("keeps both moves valid when two people move cards at the same time", async () => {
    const { ada, project, a, b, c, open } = await setup();
    const results = await Promise.allSettled([
      moveTask(testDb, ada, c.id, { statusId: open.id, afterId: a.id, beforeId: b.id }),
      moveTask(testDb, ada, a.id, { statusId: open.id, afterId: b.id, beforeId: c.id }),
    ]);
    for (const r of results) {
      if (r.status === "rejected") expect(r.reason).toMatchObject({ code: "CONFLICT" });
    }
    expect((await board(project.id)).sort()).toEqual(["A:Offen", "B:Offen", "C:Offen"]);
  });

  it("reports a stale board as CONFLICT", async () => {
    const { ada, a, b, doing, project } = await setup();
    await moveTask(testDb, ada, b.id, { statusId: doing.id, afterId: null, beforeId: null });
    const other = await makeProject(ada, "OTH");
    const foreign = await createTask(testDb, ada, { projectId: other.project.id, title: "F" });
    await expect(moveTask(testDb, ada, a.id, { statusId: doing.id, afterId: null, beforeId: foreign.id })).rejects.toMatchObject({
      code: "CONFLICT",
    });
    const open = (await listProjectTasks(testDb, project.id)).find((r) => r.id === a.id)!.status.id;
    await expect(moveTask(testDb, ada, a.id, { statusId: open, afterId: b.id, beforeId: null })).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("validates status, self-reference and permissions", async () => {
    const { ada, a, project, open } = await setup();
    const other = await makeProject(ada, "STA");
    await expect(moveTask(testDb, ada, a.id, { statusId: other.open.id, afterId: null, beforeId: null })).rejects.toMatchObject({
      code: "VALIDATION",
    });
    await expect(moveTask(testDb, ada, a.id, { statusId: open.id, afterId: a.id, beforeId: null })).rejects.toMatchObject({
      code: "VALIDATION",
    });
    const gast = await makeActor("gast@example.com");
    await addMember(project.id, gast, "guest");
    await expect(moveTask(testDb, gast, a.id, { statusId: open.id, afterId: null, beforeId: null })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});
