import { mkdir, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { attachments, projects, tasks } from "@/server/db/schema";
import { createPhase } from "@/server/phases/service";
import {
  archiveProject,
  completeProject,
  deleteProject,
  getProjectReport,
  listArchivedProjects,
  restoreProject,
  updateProjectDetails,
} from "@/server/projects/lifecycle";
import { getProjectForUser, listProjectsForUser } from "@/server/projects/service";
import { setTaskAssignees } from "@/server/tasks/relations";
import { createTask, updateTask } from "@/server/tasks/service";
import { resetDb, testDb } from "../helpers/db";
import { addMember, makeActor, makeProject } from "../helpers/fixtures";

async function setup() {
  const ada = await makeActor("ada@example.com");
  const mia = await makeActor("mia@example.com");
  const p = await makeProject(ada, "LIF");
  await addMember(p.project.id, mia, "member");
  const open = await createTask(testDb, ada, { projectId: p.project.id, title: "Offen" });
  const late = await createTask(testDb, ada, { projectId: p.project.id, title: "Zu spät" });
  const done = await createTask(testDb, ada, { projectId: p.project.id, title: "Fertig" });
  await createTask(testDb, ada, { projectId: p.project.id, title: "Teil", parentId: open.id });
  await updateTask(testDb, ada, late.id, late.updatedAt.toISOString(), { dueDate: "2026-09-01" });
  await updateTask(testDb, ada, done.id, done.updatedAt.toISOString(), { statusId: p.done.id });
  await setTaskAssignees(testDb, ada, done.id, [mia.id]);
  await setTaskAssignees(testDb, ada, open.id, [mia.id]);
  return { ada, mia, p, open };
}

describe("project lifecycle", () => {
  beforeEach(resetDb);

  it("lets owners rename the project, but not members", async () => {
    const { ada, mia, p } = await setup();
    await updateProjectDetails(testDb, ada, p.project.id, { name: " Neu ", description: "Ziel" });
    const [row] = await testDb.select().from(projects).where(eq(projects.id, p.project.id));
    expect(row).toMatchObject({ name: "Neu", description: "Ziel" });
    await expect(updateProjectDetails(testDb, mia, p.project.id, { name: "X", description: "" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("reports progress, open work, milestones and contributions", async () => {
    const { ada, p } = await setup();
    await createPhase(testDb, ada, p.project.id, { name: "Go-live", startDate: "2026-09-15", endDate: "2026-09-15", isMilestone: true });
    const report = await getProjectReport(testDb, ada, p.project.id, "2026-10-02");
    expect(report.tasks).toEqual({ total: 3, done: 1, open: 2, overdue: 1, subtasks: 1 });
    expect(report.openTasks.map((t) => t.title)).toEqual(["Zu spät", "Offen"]);
    expect(report.milestones).toEqual([{ name: "Go-live", date: "2026-09-15", reached: true }]);
    expect(report.members.find((m) => m.name === "mia")).toMatchObject({ assigned: 2, done: 1 });
  });

  it("completes a project: closes open tasks, keeps the note, archives it read-only", async () => {
    const { ada, mia, p, open } = await setup();
    await expect(completeProject(testDb, mia, p.project.id, {})).rejects.toMatchObject({ code: "FORBIDDEN" });
    await completeProject(testDb, ada, p.project.id, { note: "Gut gelaufen", closeOpenTasks: true });

    const [row] = await testDb.select().from(projects).where(eq(projects.id, p.project.id));
    expect(row.archivedAt).not.toBeNull();
    expect(row.completedAt).not.toBeNull();
    expect(row.closingNote).toBe("Gut gelaufen");
    const statuses = await testDb.select({ statusId: tasks.statusId }).from(tasks).where(eq(tasks.projectId, p.project.id));
    expect(statuses.every((t) => t.statusId === p.done.id)).toBe(true);

    expect(await listProjectsForUser(testDb, mia)).toEqual([]);
    expect((await listArchivedProjects(testDb, mia)).map((x) => x.key)).toEqual(["LIF"]);
    expect((await getProjectForUser(testDb, ada, p.project.id))?.role).toBe("readonly");
    await expect(updateTask(testDb, ada, open.id, new Date().toISOString(), { title: "X" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(createTask(testDb, ada, { projectId: p.project.id, title: "Neu" })).rejects.toMatchObject({ code: "FORBIDDEN" });

    await restoreProject(testDb, ada, p.project.id);
    expect((await getProjectForUser(testDb, ada, p.project.id))?.role).toBe("owner");
  });

  it("archives without review and blocks even admins from editing until restored", async () => {
    const { ada, p } = await setup();
    const root = await makeActor("root@example.com", "admin");
    await archiveProject(testDb, ada, p.project.id);
    const [row] = await testDb.select().from(projects).where(eq(projects.id, p.project.id));
    expect(row.completedAt).toBeNull();
    await expect(createTask(testDb, root, { projectId: p.project.id, title: "Neu" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("lists archived projects with final progress and who may restore them", async () => {
    const { ada, mia, p } = await setup();
    const root = await makeActor("root@example.com", "admin");
    const other = await makeActor("ole@example.com");
    await archiveProject(testDb, ada, p.project.id);

    const [forAda] = await listArchivedProjects(testDb, ada);
    // Top-level tasks only: three tasks, one done; the subtask does not count.
    expect(forAda).toMatchObject({ key: "LIF", taskTotal: 3, taskDone: 1, canRestore: true });
    expect((await listArchivedProjects(testDb, mia))[0].canRestore).toBe(false);
    expect((await listArchivedProjects(testDb, root))[0].canRestore).toBe(true);
    expect(await listArchivedProjects(testDb, other)).toEqual([]);
  });

  it("deletes a project with its files only after the key is repeated", async () => {
    const { ada, mia, p, open } = await setup();
    const dir = join(tmpdir(), `pp-lifecycle-${Date.now()}`);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "file-key"), "x");
    await testDb.insert(attachments).values({ taskId: open.id, filename: "a.txt", mime: "text/plain", size: 1, storageKey: "file-key", uploadedBy: ada.id });

    await expect(deleteProject(testDb, mia, p.project.id, "LIF", dir)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(deleteProject(testDb, ada, p.project.id, "FALSCH", dir)).rejects.toMatchObject({ code: "VALIDATION" });
    await deleteProject(testDb, ada, p.project.id, "lif", dir);
    expect(await testDb.select().from(projects).where(eq(projects.id, p.project.id))).toEqual([]);
    expect(await testDb.select().from(tasks).where(eq(tasks.projectId, p.project.id))).toEqual([]);
    await expect(stat(join(dir, "file-key"))).rejects.toThrow();
  });
});
