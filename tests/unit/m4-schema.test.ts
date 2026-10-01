import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { phases, taskDependencies, tasks } from "@/server/db/schema";
import { createTask } from "@/server/tasks/service";
import { resetDb, testDb } from "../helpers/db";
import { makeActor, makeProject } from "../helpers/fixtures";

describe("M4 schema", () => {
  beforeEach(resetDb);

  it("keeps tasks when their phase is deleted", async () => {
    const actor = await makeActor("phase@example.com");
    const { project } = await makeProject(actor, "PHA");
    const task = await createTask(testDb, actor, { projectId: project.id, title: "Planung" });
    const [phase] = await testDb
      .insert(phases)
      .values({ projectId: project.id, name: "Konzept", position: "a0" })
      .returning();
    await testDb.update(tasks).set({ phaseId: phase.id }).where(eq(tasks.id, task.id));
    await testDb.delete(phases).where(eq(phases.id, phase.id));
    const [remaining] = await testDb.select({ phaseId: tasks.phaseId }).from(tasks).where(eq(tasks.id, task.id));
    expect(remaining.phaseId).toBeNull();
  });

  it("enforces unique phase names, milestone dates and dependency constraints", async () => {
    const actor = await makeActor("graph@example.com");
    const { project } = await makeProject(actor, "GRA");
    await testDb.insert(phases).values({ projectId: project.id, name: "Konzept", position: "a0" });
    await expect(testDb.insert(phases).values({ projectId: project.id, name: "konzept", position: "a1" })).rejects.toThrow();
    await expect(
      testDb.insert(phases).values({ projectId: project.id, name: "Meilenstein", isMilestone: true, position: "a1" }),
    ).rejects.toThrow();

    const a = await createTask(testDb, actor, { projectId: project.id, title: "A" });
    const b = await createTask(testDb, actor, { projectId: project.id, title: "B" });
    await expect(testDb.insert(taskDependencies).values({ blockerId: a.id, blockedId: a.id })).rejects.toThrow();
    await expect(testDb.insert(taskDependencies).values({ blockerId: a.id, blockedId: b.id, lagDays: -1 })).rejects.toThrow();
    await testDb.insert(taskDependencies).values({ blockerId: a.id, blockedId: b.id, lagDays: 2 });
    await expect(testDb.insert(taskDependencies).values({ blockerId: a.id, blockedId: b.id })).rejects.toThrow();
  });
});
