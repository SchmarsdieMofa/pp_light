import { beforeEach, describe, expect, it } from "vitest";
import { addChecklistItem, setChecklistItemDone } from "@/server/checklists/service";
import { createLabel } from "@/server/labels/service";
import { getTaskDetail, listProjectTasks } from "@/server/tasks/queries";
import { setTaskAssignees, setTaskLabels } from "@/server/tasks/relations";
import { createTask, updateTask } from "@/server/tasks/service";
import { resetDb, testDb } from "../helpers/db";
import { addMember, makeActor, makeProject } from "../helpers/fixtures";

async function setup() {
  const ada = await makeActor("ada@example.com");
  const mia = await makeActor("mia@example.com");
  const p = await makeProject(ada, "QRY");
  await addMember(p.project.id, mia, "member");
  const design = await createLabel(testDb, ada, { projectId: p.project.id, name: "Design", color: "#a855f7" });
  const logo = await createTask(testDb, ada, { projectId: p.project.id, title: "Logo 100% fertig" });
  const header = await createTask(testDb, ada, { projectId: p.project.id, title: "Header_bauen" });
  const footer = await createTask(testDb, ada, { projectId: p.project.id, title: "Footer" });
  const sub = await createTask(testDb, ada, { projectId: p.project.id, title: "Unter", parentId: logo.id });
  await updateTask(testDb, ada, sub.id, sub.updatedAt.toISOString(), { statusId: p.done.id });
  await createTask(testDb, ada, { projectId: p.project.id, title: "Unter 2", parentId: logo.id });
  await setTaskAssignees(testDb, ada, header.id, [mia.id]);
  await setTaskLabels(testDb, ada, logo.id, [design.id]);
  const item = await addChecklistItem(testDb, ada, logo.id, "A");
  await addChecklistItem(testDb, ada, logo.id, "B");
  await setChecklistItemDone(testDb, ada, item.id, true);
  const h = await updateTask(testDb, ada, header.id, header.updatedAt.toISOString(), { priority: "urgent", dueDate: "2026-10-01" });
  await updateTask(testDb, ada, footer.id, footer.updatedAt.toISOString(), { priority: "low", dueDate: "2026-09-01" });
  return { ada, mia, ...p, design, logo, header: h, footer, sub };
}

describe("listProjectTasks", () => {
  beforeEach(resetDb);

  it("lists top-level tasks with status, assignees, labels and progress", async () => {
    const { project, mia } = await setup();
    const rows = await listProjectTasks(testDb, project.id);
    expect(rows.map((r) => r.title)).toEqual(["Logo 100% fertig", "Header_bauen", "Footer"]);
    const [logo, header] = rows;
    expect(logo.key).toBe("QRY");
    expect(logo.subtasks).toEqual({ done: 1, total: 2 });
    expect(logo.checklist).toEqual({ done: 1, total: 2 });
    expect(logo.labels.map((l) => l.name)).toEqual(["Design"]);
    expect(header.assignees).toEqual([{ id: mia.id, name: "mia" }]);
    expect(header.status.name).toBe("Offen");
  });

  it("filters by assignee, label, priority and status", async () => {
    const { project, mia, design, done } = await setup();
    const titles = async (f: Parameters<typeof listProjectTasks>[2]) =>
      (await listProjectTasks(testDb, project.id, f)).map((r) => r.title);
    expect(await titles({ assigneeId: mia.id })).toEqual(["Header_bauen"]);
    expect(await titles({ labelId: design.id })).toEqual(["Logo 100% fertig"]);
    expect(await titles({ priority: "low" })).toEqual(["Footer"]);
    expect(await titles({ statusId: done.id })).toEqual([]);
  });

  it("searches literally and by number", async () => {
    const { project } = await setup();
    const titles = async (q: string) => (await listProjectTasks(testDb, project.id, { q })).map((r) => r.title);
    expect(await titles("100%")).toEqual(["Logo 100% fertig"]);
    expect(await titles("_")).toEqual(["Header_bauen"]);
    expect(await titles("\\")).toEqual([]);
    expect(await titles("QRY-2")).toEqual(["Header_bauen"]);
    expect(await titles("3")).toEqual(["Footer"]);
  });

  it("returns a short description excerpt and supports board order", async () => {
    const { ada, project, logo } = await setup();
    await updateTask(testDb, ada, logo.id, (await getTaskDetail(testDb, ada, logo.id))!.updatedAt, {
      description: "x".repeat(300),
    });
    const rows = await listProjectTasks(testDb, project.id, {}, { field: "position", dir: "asc" });
    expect(rows.find((r) => r.id === logo.id)?.descriptionExcerpt).toHaveLength(140);
    expect(rows.map((r) => r.title)).toEqual(["Logo 100% fertig", "Header_bauen", "Footer"]);
  });

  it("sorts by priority and due date (empty dates last)", async () => {
    const { project } = await setup();
    const titles = async (field: "priority" | "dueDate", dir: "asc" | "desc") =>
      (await listProjectTasks(testDb, project.id, {}, { field, dir })).map((r) => r.title);
    expect(await titles("priority", "desc")).toEqual(["Header_bauen", "Footer", "Logo 100% fertig"]);
    expect(await titles("dueDate", "asc")).toEqual(["Footer", "Header_bauen", "Logo 100% fertig"]);
    expect(await titles("dueDate", "desc")).toEqual(["Header_bauen", "Footer", "Logo 100% fertig"]);
  });
});

describe("getTaskDetail", () => {
  beforeEach(resetDb);

  it("returns everything the editor needs", async () => {
    const { ada, logo, design, project } = await setup();
    const detail = await getTaskDetail(testDb, ada, logo.id);
    expect(detail).toMatchObject({
      id: logo.id,
      key: "QRY",
      number: 1,
      projectName: project.name,
      canEdit: true,
      parent: null,
      labelIds: [design.id],
      hintAllSubtasksDone: false,
    });
    expect(detail?.subtasks.map((s) => [s.title, s.isDone])).toEqual([
      ["Unter", true],
      ["Unter 2", false],
    ]);
    expect(detail?.checklist.map((c) => c.text)).toEqual(["A", "B"]);
    expect(detail?.statuses).toHaveLength(4);
    expect(detail?.members.map((m) => m.name)).toEqual(["ada", "mia"]);
    expect(typeof detail?.updatedAt).toBe("string");
  });

  it("shows the parent for subtasks and the done hint once all subtasks are done", async () => {
    const { ada, logo, sub, done } = await setup();
    const subDetail = await getTaskDetail(testDb, ada, sub.id);
    expect(subDetail?.parent).toMatchObject({ id: logo.id, number: 1 });
    const second = (await getTaskDetail(testDb, ada, logo.id))!.subtasks[1];
    const secondTask = await getTaskDetail(testDb, ada, second.id);
    await updateTask(testDb, ada, second.id, secondTask!.updatedAt, { statusId: done.id });
    expect((await getTaskDetail(testDb, ada, logo.id))?.hintAllSubtasksDone).toBe(true);
  });

  it("is read-only for guests and null for outsiders or bad ids", async () => {
    const { project, logo } = await setup();
    const gast = await makeActor("gast@example.com");
    const fremd = await makeActor("fremd@example.com");
    await addMember(project.id, gast, "guest");
    expect((await getTaskDetail(testDb, gast, logo.id))?.canEdit).toBe(false);
    expect(await getTaskDetail(testDb, fremd, logo.id)).toBeNull();
    expect(await getTaskDetail(testDb, gast, "kaputt")).toBeNull();
  });
});
