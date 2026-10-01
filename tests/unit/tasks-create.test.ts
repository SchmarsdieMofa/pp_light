import { beforeEach, describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { listActivity } from "@/server/activity/service";
import { createTask } from "@/server/tasks/service";
import { resetDb, testDb } from "../helpers/db";
import { addMember, makeActor, makeProject } from "../helpers/fixtures";

describe("createTask", () => {
  beforeEach(resetDb);

  it("numbers tasks per project, defaults to the first status and logs the creation", async () => {
    const ada = await makeActor("ada@example.com");
    const a = await makeProject(ada, "AAA");
    const b = await makeProject(ada, "BBB");
    const t1 = await createTask(testDb, ada, { projectId: a.project.id, title: "  Erste " });
    const t2 = await createTask(testDb, ada, { projectId: a.project.id, title: "Zweite" });
    const other = await createTask(testDb, ada, { projectId: b.project.id, title: "Andere" });

    expect([t1.number, t2.number, other.number]).toEqual([1, 2, 1]);
    expect(t1.title).toBe("Erste");
    expect(t1.statusId).toBe(a.open.id);
    expect(t1.completedAt).toBeNull();
    expect(t2.position > t1.position).toBe(true);
    expect((await listActivity(testDb, t1.id)).map((e) => e.action)).toEqual(["task.created"]);
  });

  it("hands out unique, gapless numbers under concurrency", async () => {
    const ada = await makeActor("ada@example.com");
    const { project } = await makeProject(ada, "CON");
    const created = await Promise.all(
      Array.from({ length: 10 }, (_, i) => createTask(testDb, ada, { projectId: project.id, title: `T${i}` })),
    );
    expect(created.map((t) => t.number).sort((x, y) => x - y)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("sets completedAt when created directly in a done status", async () => {
    const ada = await makeActor("ada@example.com");
    const { project, done } = await makeProject(ada, "DON");
    const task = await createTask(testDb, ada, { projectId: project.id, title: "Schon fertig", statusId: done.id });
    expect(task.completedAt).not.toBeNull();
  });

  it("creates subtasks one level deep only", async () => {
    const ada = await makeActor("ada@example.com");
    const { project } = await makeProject(ada, "SUB");
    const parent = await createTask(testDb, ada, { projectId: project.id, title: "Parent" });
    const child = await createTask(testDb, ada, { projectId: project.id, title: "Kind", parentId: parent.id });
    expect(child.parentId).toBe(parent.id);
    expect((await listActivity(testDb, child.id)).map((e) => e.action)).toEqual(["subtask.created"]);
    await expect(
      createTask(testDb, ada, { projectId: project.id, title: "Enkel", parentId: child.id }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("rejects a parent or status from another project", async () => {
    const ada = await makeActor("ada@example.com");
    const a = await makeProject(ada, "PA");
    const b = await makeProject(ada, "PB");
    const foreign = await createTask(testDb, ada, { projectId: b.project.id, title: "Fremd" });
    await expect(
      createTask(testDb, ada, { projectId: a.project.id, title: "X", parentId: foreign.id }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(
      createTask(testDb, ada, { projectId: a.project.id, title: "X", statusId: b.open.id }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("enforces permissions: guests may not create, non-members get NOT_FOUND", async () => {
    const ada = await makeActor("ada@example.com");
    const gast = await makeActor("gast@example.com");
    const fremd = await makeActor("fremd@example.com");
    const { project } = await makeProject(ada, "PER");
    await addMember(project.id, gast, "guest");
    await expect(createTask(testDb, gast, { projectId: project.id, title: "X" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(createTask(testDb, fremd, { projectId: project.id, title: "X" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("validates the title", async () => {
    const ada = await makeActor("ada@example.com");
    const { project } = await makeProject(ada, "VAL");
    await expect(createTask(testDb, ada, { projectId: project.id, title: "   " })).rejects.toBeInstanceOf(ZodError);
  });
});
