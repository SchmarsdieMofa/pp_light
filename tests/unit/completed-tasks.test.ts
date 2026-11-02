import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tasks } from "@/server/db/schema";
import { listProjectTasks } from "@/server/tasks/queries";
import { createTask, moveTask, updateTask } from "@/server/tasks/service";
import { resetDb, testDb } from "../helpers/db";
import { makeActor, makeProject } from "../helpers/fixtures";

describe("completed tasks", () => {
  beforeEach(resetDb);
  afterEach(() => vi.useRealTimers());

  it.each([
    ["2026-10-05T12:00:00Z", "2026-10-04T22:00:00Z", "2026-10-05T22:00:00Z"],
    ["2026-03-29T12:00:00Z", "2026-03-28T23:00:00Z", "2026-03-29T22:00:00Z"],
    ["2026-10-25T12:00:00Z", "2026-10-24T22:00:00Z", "2026-10-25T23:00:00Z"],
  ])("keeps the full history but only today's Berlin completions on the board (%s)", async (now, midnight, tomorrow) => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(now));
    const owner = await makeActor("owner@example.com");
    const p = await makeProject(owner, "DONE");
    await createTask(testDb, owner, { projectId: p.project.id, title: "Open" });
    for (const [title, completedAt] of [
      ["Yesterday", new Date(new Date(midnight).getTime() - 1)],
      ["Today", new Date(midnight)], ["Tomorrow", new Date(tomorrow)], ["Legacy", null],
    ] as const) {
      const task = await createTask(testDb, owner, { projectId: p.project.id, title, statusId: p.done.id });
      await testDb.update(tasks).set({ completedAt }).where(eq(tasks.id, task.id));
    }
    const titles = async (completion: "open" | "done" | "board") =>
      (await listProjectTasks(testDb, p.project.id, { completion })).map((t) => t.title);
    expect(await titles("open")).toEqual(["Open"]);
    expect(await titles("done")).toEqual(["Yesterday", "Today", "Tomorrow", "Legacy"]);
    expect(await titles("board")).toEqual(["Open", "Today"]);
  });

  it("removes reopened tasks from the history and records a fresh completion through board moves", async () => {
    const owner = await makeActor("owner@example.com");
    const p = await makeProject(owner, "REOPEN");
    const task = await createTask(testDb, owner, { projectId: p.project.id, title: "Task", statusId: p.done.id });
    const reopened = await updateTask(testDb, owner, task.id, task.updatedAt.toISOString(), { statusId: p.open.id });
    expect(reopened.completedAt).toBeNull();
    expect(await listProjectTasks(testDb, p.project.id, { completion: "done" })).toEqual([]);
    await moveTask(testDb, owner, task.id, { statusId: p.done.id, afterId: null, beforeId: null });
    expect((await listProjectTasks(testDb, p.project.id, { completion: "board" })).map((t) => t.id)).toEqual([task.id]);
    expect((await listProjectTasks(testDb, p.project.id, { completion: "done" })).map((t) => t.id)).toEqual([task.id]);
  });
});
