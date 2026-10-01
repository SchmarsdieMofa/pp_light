import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { ZodError } from "zod";
import { tasks } from "@/server/db/schema";
import { listStatuses } from "@/server/projects/service";
import { createStatus, deleteStatus, moveStatus, updateStatus } from "@/server/statuses/service";
import { getTaskDetail } from "@/server/tasks/queries";
import { createTask, updateTask } from "@/server/tasks/service";
import { resetDb, testDb } from "../helpers/db";
import { addMember, makeActor, makeProject } from "../helpers/fixtures";

const names = async (projectId: string) => (await listStatuses(testDb, projectId)).map((s) => s.name);

describe("status columns", () => {
  beforeEach(resetDb);

  it("creates at the end, renames, recolors and reorders", async () => {
    const ada = await makeActor("ada@example.com");
    const { project, open } = await makeProject(ada, "STS");
    const blocked = await createStatus(testDb, ada, project.id, { name: " Blockiert ", color: "#ef4444", isDone: false });
    expect(await names(project.id)).toEqual(["Offen", "In Arbeit", "Review", "Fertig", "Blockiert"]);
    await updateStatus(testDb, ada, blocked.id, { name: "Wartet", color: "#64748b", isDone: false });
    await moveStatus(testDb, ada, blocked.id, "left");
    await moveStatus(testDb, ada, open.id, "left");
    expect(await names(project.id)).toEqual(["Offen", "In Arbeit", "Review", "Wartet", "Fertig"]);
    const statuses = await listStatuses(testDb, project.id);
    expect(statuses.find((s) => s.name === "Wartet")?.color).toBe("#64748b");
  });

  it("rejects duplicate names and invalid input", async () => {
    const ada = await makeActor("ada@example.com");
    const { project } = await makeProject(ada, "DUP");
    await expect(createStatus(testDb, ada, project.id, { name: "offen", color: "#ef4444", isDone: false })).rejects.toMatchObject({
      code: "VALIDATION",
    });
    await expect(createStatus(testDb, ada, project.id, { name: "", color: "#ef4444", isDone: false })).rejects.toBeInstanceOf(ZodError);
  });

  it("moves all tasks (incl. subtasks) to the target when deleting and fixes completedAt", async () => {
    const ada = await makeActor("ada@example.com");
    const { project, open, done } = await makeProject(ada, "DEL");
    const parent = await createTask(testDb, ada, { projectId: project.id, title: "P" });
    const child = await createTask(testDb, ada, { projectId: project.id, title: "C", parentId: parent.id });
    // updatedAt has millisecond precision: make sure the bump below lands on a later millisecond
    await new Promise((resolve) => setTimeout(resolve, 5));
    await deleteStatus(testDb, ada, open.id, done.id);
    expect(await names(project.id)).toEqual(["In Arbeit", "Review", "Fertig"]);
    const p = await getTaskDetail(testDb, ada, parent.id);
    const c = await getTaskDetail(testDb, ada, child.id);
    expect([p?.statusId, c?.statusId]).toEqual([done.id, done.id]);
    // moved tasks got a new updatedAt → an editor that still holds the old stamp must hit CONFLICT
    await expect(updateTask(testDb, ada, parent.id, parent.updatedAt.toISOString(), { title: "X" })).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("keeps task completion in sync when a column changes its done setting", async () => {
    const ada = await makeActor("ada@example.com");
    const { project, open } = await makeProject(ada, "FLP");
    const task = await createTask(testDb, ada, { projectId: project.id, title: "A" });
    await updateStatus(testDb, ada, open.id, { name: open.name, color: "#ef4444", isDone: true });
    const [completed] = await testDb.select({ completedAt: tasks.completedAt }).from(tasks).where(eq(tasks.id, task.id));
    expect(completed.completedAt).not.toBeNull();
    await updateStatus(testDb, ada, open.id, { name: open.name, color: "#ef4444", isDone: false });
    const [reopened] = await testDb.select({ completedAt: tasks.completedAt }).from(tasks).where(eq(tasks.id, task.id));
    expect(reopened.completedAt).toBeNull();
  });

  it("keeps a column when two deletions target each other", async () => {
    const ada = await makeActor("ada@example.com");
    const { project, statuses } = await makeProject(ada, "RAC");
    await deleteStatus(testDb, ada, statuses[0].id, statuses[2].id);
    await deleteStatus(testDb, ada, statuses[1].id, statuses[2].id);
    const [a, b] = [statuses[2], statuses[3]];
    const results = await Promise.allSettled([
      deleteStatus(testDb, ada, a.id, b.id),
      deleteStatus(testDb, ada, b.id, a.id),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(await names(project.id)).toHaveLength(1);
  });

  it("refuses to delete the last column or into itself/another project", async () => {
    const ada = await makeActor("ada@example.com");
    const { project, statuses } = await makeProject(ada, "LST");
    const other = await makeProject(ada, "OTH");
    await expect(deleteStatus(testDb, ada, statuses[0].id, statuses[0].id)).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(deleteStatus(testDb, ada, statuses[0].id, other.open.id)).rejects.toMatchObject({ code: "VALIDATION" });
    await deleteStatus(testDb, ada, statuses[0].id, statuses[3].id);
    await deleteStatus(testDb, ada, statuses[1].id, statuses[3].id);
    await deleteStatus(testDb, ada, statuses[2].id, statuses[3].id);
    expect(await names(project.id)).toEqual(["Fertig"]);
    await expect(deleteStatus(testDb, ada, statuses[3].id, statuses[3].id)).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("allows only owners/admins", async () => {
    const ada = await makeActor("ada@example.com");
    const mia = await makeActor("mia@example.com");
    const { project, open } = await makeProject(ada, "OWN");
    await addMember(project.id, mia, "member");
    await expect(createStatus(testDb, mia, project.id, { name: "X", color: "#ef4444", isDone: false })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(moveStatus(testDb, mia, open.id, "right")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(updateStatus(testDb, mia, "kaputt", { name: "X", color: "#ef4444", isDone: false })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});
