import { beforeEach, describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { listActivity } from "@/server/activity/service";
import { MAX_TASK_DEPTH } from "@/lib/task-path";
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

  it("numbers subtasks hierarchically without using up top-level numbers", async () => {
    const ada = await makeActor("ada@example.com");
    const { project } = await makeProject(ada, "HIE");
    const make = (title: string, parentId?: string) => createTask(testDb, ada, { projectId: project.id, title, parentId });
    const one = await make("Eins");
    const oneOne = await make("Eins-Eins", one.id);
    const oneTwo = await make("Eins-Zwei", one.id);
    const deep = await make("Tief", oneOne.id);
    const deeper = await make("Tiefer", deep.id);
    const two = await make("Zwei");
    expect([one, oneOne, oneTwo, deep, deeper, two].map((t) => t.path)).toEqual(["1", "1.1", "1.2", "1.1.1", "1.1.1.1", "2"]);
    expect(two.number).toBe(2);
  });

  it("limits how deep subtasks nest", async () => {
    const ada = await makeActor("ada@example.com");
    const { project } = await makeProject(ada, "DEP");
    let task = await createTask(testDb, ada, { projectId: project.id, title: "Ebene 1" });
    for (let level = 2; level <= MAX_TASK_DEPTH; level++) {
      task = await createTask(testDb, ada, { projectId: project.id, title: `Ebene ${level}`, parentId: task.id });
    }
    expect(task.path).toBe("1.1.1.1.1.1");
    await expect(createTask(testDb, ada, { projectId: project.id, title: "Zu tief", parentId: task.id })).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("numbers sibling subtasks uniquely under concurrency", async () => {
    const ada = await makeActor("ada@example.com");
    const { project } = await makeProject(ada, "SIB");
    const parent = await createTask(testDb, ada, { projectId: project.id, title: "Eltern" });
    const kids = await Promise.all(
      Array.from({ length: 6 }, (_, i) => createTask(testDb, ada, { projectId: project.id, title: `K${i}`, parentId: parent.id })),
    );
    expect(kids.map((t) => t.path).sort()).toEqual(["1.1", "1.2", "1.3", "1.4", "1.5", "1.6"]);
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

  it("creates subtasks and lets them have subtasks of their own", async () => {
    const ada = await makeActor("ada@example.com");
    const { project } = await makeProject(ada, "SUB");
    const parent = await createTask(testDb, ada, { projectId: project.id, title: "Parent" });
    const child = await createTask(testDb, ada, { projectId: project.id, title: "Kind", parentId: parent.id });
    expect(child.parentId).toBe(parent.id);
    expect((await listActivity(testDb, child.id)).map((e) => e.action)).toEqual(["subtask.created"]);
    const grandchild = await createTask(testDb, ada, { projectId: project.id, title: "Enkel", parentId: child.id });
    expect([parent.path, child.path, grandchild.path]).toEqual(["1", "1.1", "1.1.1"]);
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
