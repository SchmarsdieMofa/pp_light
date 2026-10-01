import { beforeEach, describe, expect, it } from "vitest";
import { listActivity } from "@/server/activity/service";
import { createTask, updateTask } from "@/server/tasks/service";
import { resetDb, testDb } from "../helpers/db";
import { addMember, makeActor, makeProject } from "../helpers/fixtures";

async function setup() {
  const ada = await makeActor("ada@example.com");
  const p = await makeProject(ada, "UPD");
  const task = await createTask(testDb, ada, { projectId: p.project.id, title: "Original" });
  return { ada, ...p, task };
}

describe("updateTask", () => {
  beforeEach(resetDb);

  it("updates fields, bumps updatedAt and logs a diff of the changed fields only", async () => {
    const { ada, task } = await setup();
    const updated = await updateTask(testDb, ada, task.id, task.updatedAt.toISOString(), {
      title: "Neu",
      priority: "high",
      dueDate: "2026-10-14",
      description: "",
    });
    expect(updated.title).toBe("Neu");
    expect(updated.priority).toBe("high");
    expect(updated.dueDate).toBe("2026-10-14");
    expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(task.updatedAt.getTime());
    const log = await listActivity(testDb, task.id);
    expect(log.at(-1)).toMatchObject({
      action: "task.updated",
      diff: { title: ["Original", "Neu"], priority: ["none", "high"], dueDate: [null, "2026-10-14"] },
    });
  });

  it("rejects a stale updatedAt with CONFLICT", async () => {
    const { ada, task } = await setup();
    const stale = task.updatedAt.toISOString();
    await updateTask(testDb, ada, task.id, stale, { title: "Erster" });
    await expect(updateTask(testDb, ada, task.id, stale, { title: "Zweiter" })).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("lets exactly one of two concurrent saves win", async () => {
    const { ada, task } = await setup();
    const stale = task.updatedAt.toISOString();
    const results = await Promise.allSettled([
      updateTask(testDb, ada, task.id, stale, { title: "A" }),
      updateTask(testDb, ada, task.id, stale, { title: "B" }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((results.find((r) => r.status === "rejected") as PromiseRejectedResult).reason).toMatchObject({
      code: "CONFLICT",
    });
  });

  it("does nothing when nothing changes", async () => {
    const { ada, task } = await setup();
    const same = await updateTask(testDb, ada, task.id, task.updatedAt.toISOString(), { title: "Original" });
    expect(same.updatedAt.toISOString()).toBe(task.updatedAt.toISOString());
    expect(await listActivity(testDb, task.id)).toHaveLength(1);
  });

  it("sets and clears completedAt with done statuses", async () => {
    const { ada, task, done, open } = await setup();
    const finished = await updateTask(testDb, ada, task.id, task.updatedAt.toISOString(), { statusId: done.id });
    expect(finished.completedAt).not.toBeNull();
    const reopened = await updateTask(testDb, ada, task.id, finished.updatedAt.toISOString(), { statusId: open.id });
    expect(reopened.completedAt).toBeNull();
  });

  it("checks start ≤ due also when only one side changes", async () => {
    const { ada, task } = await setup();
    const withDue = await updateTask(testDb, ada, task.id, task.updatedAt.toISOString(), { dueDate: "2026-10-01" });
    await expect(
      updateTask(testDb, ada, task.id, withDue.updatedAt.toISOString(), { startDate: "2026-10-05" }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("rejects a status from another project", async () => {
    const { ada, task } = await setup();
    const other = await makeProject(ada, "OTH");
    await expect(
      updateTask(testDb, ada, task.id, task.updatedAt.toISOString(), { statusId: other.open.id }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("forbids guests and hides tasks from non-members", async () => {
    const { project, task } = await setup();
    const gast = await makeActor("gast@example.com");
    const fremd = await makeActor("fremd@example.com");
    await addMember(project.id, gast, "guest");
    const stamp = task.updatedAt.toISOString();
    await expect(updateTask(testDb, gast, task.id, stamp, { title: "X" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(updateTask(testDb, fremd, task.id, stamp, { title: "X" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(updateTask(testDb, gast, "kaputt", stamp, { title: "X" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
