import { beforeEach, describe, expect, it } from "vitest";
import { labels, projects, statuses, tasks, users } from "@/server/db/schema";
import { resetDb, testDb } from "../helpers/db";

async function seed() {
  const [user] = await testDb.insert(users).values({ email: "a@example.com", name: "A" }).returning();
  const [project] = await testDb.insert(projects).values({ name: "P", key: "PRJ", createdBy: user.id }).returning();
  const [status] = await testDb
    .insert(statuses)
    .values({ projectId: project.id, name: "Offen", color: "#000", position: "a0" })
    .returning();
  const base = { projectId: project.id, statusId: status.id, createdBy: user.id, position: "a0" };
  return { user, project, status, base };
}

describe("task schema", () => {
  beforeEach(resetDb);

  it("stores a task with defaults and millisecond updated_at", async () => {
    const { base } = await seed();
    const [task] = await testDb.insert(tasks).values({ ...base, number: 1, title: "T" }).returning();
    expect(task.priority).toBe("none");
    expect(task.description).toBe("");
    expect(task.startDate).toBeNull();
    const { rows } = await testDb.$client.query<{ t: string }>("select updated_at::text as t from tasks");
    expect(rows[0].t).toMatch(/^\S+ \d{2}:\d{2}:\d{2}(\.\d{1,3})?[+-]/);
  });

  it("keeps task numbers unique per project", async () => {
    const { base } = await seed();
    await testDb.insert(tasks).values({ ...base, number: 1, title: "A" });
    await expect(testDb.insert(tasks).values({ ...base, number: 1, title: "B" })).rejects.toThrow();
  });

  it("rejects a start date after the due date", async () => {
    const { base } = await seed();
    await expect(
      testDb.insert(tasks).values({ ...base, number: 1, title: "A", startDate: "2026-10-10", dueDate: "2026-10-01" }),
    ).rejects.toThrow();
  });

  it("keeps label names unique per project, ignoring case", async () => {
    const { project } = await seed();
    await testDb.insert(labels).values({ projectId: project.id, name: "Design", color: "#000" });
    await expect(testDb.insert(labels).values({ projectId: project.id, name: "design", color: "#111" })).rejects.toThrow();
  });
});
