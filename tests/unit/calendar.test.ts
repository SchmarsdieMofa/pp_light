import { beforeEach, describe, expect, it } from "vitest";
import { listCalendarTasks } from "@/server/calendar/service";
import { setTaskAssignees } from "@/server/tasks/relations";
import { createTask, updateTask } from "@/server/tasks/service";
import { resetDb, testDb } from "../helpers/db";
import { addMember, makeActor, makeProject } from "../helpers/fixtures";

async function due(actor: Parameters<typeof createTask>[1], projectId: string, title: string, dueDate: string, statusId?: string) {
  const task = await createTask(testDb, actor, { projectId, title });
  return updateTask(testDb, actor, task.id, task.updatedAt.toISOString(), { dueDate, ...(statusId ? { statusId } : {}) });
}

async function setup() {
  const ada = await makeActor("ada@example.com");
  const mia = await makeActor("mia@example.com");
  const gus = await makeActor("gus@example.com");
  const root = await makeActor("root@example.com", "admin");
  const a = await makeProject(ada, "CLA");
  const b = await makeProject(ada, "CLB");
  const hidden = await makeProject(gus, "CLH");
  await addMember(a.project.id, mia, "member");
  await addMember(b.project.id, mia, "guest");
  const early = await due(ada, a.project.id, "Früh", "2026-09-30");
  const inside = await due(ada, a.project.id, "Drin", "2026-10-05");
  const other = await due(ada, b.project.id, "Anderes Projekt", "2026-10-07");
  await due(ada, a.project.id, "Erledigt", "2026-10-06", a.done.id);
  await due(ada, a.project.id, "Später", "2026-11-20");
  await due(gus, hidden.project.id, "Geheim", "2026-10-05");
  await createTask(testDb, ada, { projectId: a.project.id, title: "Ohne Termin" });
  await setTaskAssignees(testDb, ada, inside.id, [mia.id]);
  return { ada, mia, root, a, b, early, inside, other };
}

const range = { from: "2026-10-01", to: "2026-10-31" };
const titles = (rows: { title: string }[]) => rows.map((r) => r.title);

describe("calendar", () => {
  beforeEach(resetDb);

  it("lists open tasks due in the range across visible projects, ordered by date", async () => {
    const { mia, root } = await setup();
    const rows = await listCalendarTasks(testDb, mia, range);
    expect(titles(rows)).toEqual(["Drin", "Anderes Projekt"]);
    expect(rows[0]).toMatchObject({ key: "CLA", dueDate: "2026-10-05", canEdit: true });
    expect(rows[1]).toMatchObject({ key: "CLB", canEdit: false });
    // A global admin without membership sees nothing.
    expect(await listCalendarTasks(testDb, root, range)).toEqual([]);
  });

  it("filters by project, assignee and done state", async () => {
    const { mia, a } = await setup();
    expect(titles(await listCalendarTasks(testDb, mia, { ...range, projectIds: [a.project.id] }))).toEqual(["Drin"]);
    expect(titles(await listCalendarTasks(testDb, mia, { ...range, mine: true }))).toEqual(["Drin"]);
    expect(titles(await listCalendarTasks(testDb, mia, { ...range, includeDone: true }))).toEqual(["Drin", "Erledigt", "Anderes Projekt"]);
  });

  it("adds the open overdue backlog on request", async () => {
    const { mia } = await setup();
    const rows = await listCalendarTasks(testDb, mia, { ...range, overdueBefore: "2026-10-02" });
    expect(titles(rows)).toEqual(["Früh", "Drin", "Anderes Projekt"]);
  });
});
