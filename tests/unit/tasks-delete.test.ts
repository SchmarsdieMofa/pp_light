import { existsSync, mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { saveAttachment } from "@/server/attachments/service";
import { createComment } from "@/server/comments/service";
import { activityLog, attachments, comments, tasks } from "@/server/db/schema";
import { addDependency } from "@/server/dependencies/service";
import { archiveProject } from "@/server/projects/lifecycle";
import { createTask, deleteTask } from "@/server/tasks/service";
import { resetDb, testDb } from "../helpers/db";
import { addMember, makeActor, makeProject } from "../helpers/fixtures";

const bytes = (text: string) => new TextEncoder().encode(text);

describe("deleteTask", () => {
  let uploadDir: string;
  beforeEach(async () => {
    await resetDb();
    uploadDir = mkdtempSync(join(tmpdir(), "pp-delete-"));
  });

  async function setup() {
    const ada = await makeActor("ada@example.com");
    const mia = await makeActor("mia@example.com");
    const gast = await makeActor("gast@example.com");
    const fremd = await makeActor("fremd@example.com");
    const { project } = await makeProject(ada, "DEL");
    await addMember(project.id, mia, "member");
    await addMember(project.id, gast, "guest");
    const parent = await createTask(testDb, ada, { projectId: project.id, title: "Eltern" });
    const child = await createTask(testDb, ada, { projectId: project.id, title: "Kind", parentId: parent.id });
    const grandchild = await createTask(testDb, ada, { projectId: project.id, title: "Enkel", parentId: child.id });
    const other = await createTask(testDb, ada, { projectId: project.id, title: "Daneben" });
    return { ada, mia, gast, fremd, project, parent, child, grandchild, other };
  }

  it("removes the task with its subtasks, comments, links and attachment files, and keeps the rest", async () => {
    const { ada, project, parent, grandchild, other } = await setup();
    await createComment(testDb, ada, parent.id, "Hallo");
    await addDependency(testDb, ada, parent.id, other.id, 0);
    const own = await saveAttachment(testDb, ada, parent.id, { name: "a.txt", type: "text/plain", data: bytes("A") }, { uploadDir, maxBytes: 100 });
    const nested = await saveAttachment(testDb, ada, grandchild.id, { name: "b.txt", type: "text/plain", data: bytes("B") }, { uploadDir, maxBytes: 100 });
    const kept = await saveAttachment(testDb, ada, other.id, { name: "c.txt", type: "text/plain", data: bytes("C") }, { uploadDir, maxBytes: 100 });

    expect(await deleteTask(testDb, ada, parent.id, uploadDir)).toEqual({ deleted: 3 });

    const left = await testDb.select({ id: tasks.id }).from(tasks).where(eq(tasks.projectId, project.id));
    expect(left.map((t) => t.id)).toEqual([other.id]);
    expect(await testDb.select().from(comments)).toHaveLength(0);
    expect((await testDb.select().from(attachments)).map((a) => a.id)).toEqual([kept.id]);
    expect(readdirSync(uploadDir)).toEqual([kept.storageKey]);
    expect(existsSync(join(uploadDir, own.storageKey))).toBe(false);
    expect(existsSync(join(uploadDir, nested.storageKey))).toBe(false);

    const log = (await testDb.select().from(activityLog).where(eq(activityLog.projectId, project.id))).filter((e) => e.action === "task.deleted");
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ taskId: null, actorId: ada.id, diff: { path: "1", title: "Eltern", subtasks: 2 } });
  });

  it("does not take a task along whose number only starts the same (1 vs 11)", async () => {
    const ada = await makeActor("ada@example.com");
    const { project } = await makeProject(ada, "NUM");
    const made = [];
    for (let i = 0; i < 11; i++) made.push(await createTask(testDb, ada, { projectId: project.id, title: `T${i + 1}` }));
    await deleteTask(testDb, ada, made[0].id, uploadDir);
    expect(await testDb.select({ id: tasks.id }).from(tasks).where(eq(tasks.projectId, project.id))).toHaveLength(10);
  });

  it("refuses to delete in an archived project and leaves the task alone", async () => {
    const { ada, project, other } = await setup();
    await archiveProject(testDb, ada, project.id);
    await expect(deleteTask(testDb, ada, other.id, uploadDir)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await testDb.select({ id: tasks.id }).from(tasks).where(eq(tasks.id, other.id))).toHaveLength(1);
  });

  it("only takes the subtree of its own project when another project uses the same paths", async () => {
    const ada = await makeActor("ada@example.com");
    const { project: first } = await makeProject(ada, "ONE");
    const { project: second } = await makeProject(ada, "TWO");
    const a = await createTask(testDb, ada, { projectId: first.id, title: "A" });
    await createTask(testDb, ada, { projectId: first.id, title: "A.1", parentId: a.id });
    const b = await createTask(testDb, ada, { projectId: second.id, title: "B" });
    await createTask(testDb, ada, { projectId: second.id, title: "B.1", parentId: b.id });
    expect([a.path, b.path]).toEqual(["1", "1"]);

    expect(await deleteTask(testDb, ada, a.id, uploadDir)).toEqual({ deleted: 2 });

    expect(await testDb.select({ id: tasks.id }).from(tasks).where(eq(tasks.projectId, first.id))).toHaveLength(0);
    const kept = await testDb.select({ path: tasks.path }).from(tasks).where(eq(tasks.projectId, second.id));
    expect(kept.map((t) => t.path).sort()).toEqual(["1", "1.1"]);
  });

  it("never hands out a deleted subtask's number again", async () => {
    const ada = await makeActor("ada@example.com");
    const { project } = await makeProject(ada, "SUB");
    const parent = await createTask(testDb, ada, { projectId: project.id, title: "Eltern" });
    await createTask(testDb, ada, { projectId: project.id, title: "Eins", parentId: parent.id });
    const second = await createTask(testDb, ada, { projectId: project.id, title: "Zwei", parentId: parent.id });
    expect(second.path).toBe("1.2");
    await deleteTask(testDb, ada, second.id, uploadDir);
    const third = await createTask(testDb, ada, { projectId: project.id, title: "Drei", parentId: parent.id });
    expect(third).toMatchObject({ path: "1.3", number: 3 });
  });

  it("is open to members, not to guests or outsiders", async () => {
    const { mia, gast, fremd, other, child } = await setup();
    await expect(deleteTask(testDb, gast, other.id, uploadDir)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(deleteTask(testDb, fremd, other.id, uploadDir)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await deleteTask(testDb, mia, child.id, uploadDir)).toEqual({ deleted: 2 });
    await expect(deleteTask(testDb, mia, child.id, uploadDir)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
