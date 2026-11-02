import { beforeEach, describe, expect, it } from "vitest";
import { filterMyWork, myWorkView } from "@/lib/my-work";
import { deleteAppointment, listAppointments, saveAppointment } from "@/server/appointments/service";
import { createLabel } from "@/server/labels/service";
import { listMyWork, setMyTaskOrder } from "@/server/my-work/service";
import { setTaskAssignees, setTaskLabels } from "@/server/tasks/relations";
import { getTaskDetail } from "@/server/tasks/queries";
import { createTask, updateTask } from "@/server/tasks/service";
import { resetDb, testDb } from "../helpers/db";
import { addMember, makeActor, makeProject } from "../helpers/fixtures";

async function setup() {
  const ada = await makeActor("ada@example.com");
  const mia = await makeActor("mia@example.com");
  const p = await makeProject(ada, "PLAN");
  await addMember(p.project.id, mia, "member");
  const work = [];
  for (const title of ["Angebot", "Entwurf", "Rechnung"]) {
    const task = await createTask(testDb, ada, { projectId: p.project.id, title });
    await setTaskAssignees(testDb, ada, task.id, [ada.id, mia.id]);
    work.push(task);
  }
  return { ada, mia, p, work };
}

describe("personal work planning", () => {
  beforeEach(resetDb);

  it("persists a per-person order while keeping filtered-out tasks in their places and the board untouched", async () => {
    const { ada, mia, work } = await setup();
    const ids = work.map((t) => t.id);
    await setMyTaskOrder(testDb, mia, [ids[2], ids[0]]);
    expect((await listMyWork(testDb, mia)).map((t) => t.id)).toEqual([ids[2], ids[1], ids[0]]);
    expect((await listMyWork(testDb, ada)).map((t) => t.id)).toEqual(ids);
    for (const task of work) expect((await getTaskDetail(testDb, ada, task.id))?.statusId).toBe(task.statusId);
    await setMyTaskOrder(testDb, ada, [ids[1], ids[0], ids[2]]);
    expect((await listMyWork(testDb, mia)).map((t) => t.id)).toEqual([ids[2], ids[1], ids[0]]);
  });

  it("rejects other people's, completed and duplicate task ids", async () => {
    const { ada, mia, p, work } = await setup();
    const other = await createTask(testDb, ada, { projectId: p.project.id, title: "Nicht zugewiesen" });
    await expect(setMyTaskOrder(testDb, mia, [other.id])).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(setMyTaskOrder(testDb, mia, [work[0].id, work[0].id])).rejects.toMatchObject({ code: "VALIDATION" });
    await updateTask(testDb, ada, work[0].id, work[0].updatedAt.toISOString(), { statusId: p.done.id });
    await expect(setMyTaskOrder(testDb, mia, [work[0].id])).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("loads assigned-task labels and combines search, project, label, priority and time filters", async () => {
    const { ada, mia, p, work } = await setup();
    const label = await createLabel(testDb, ada, { projectId: p.project.id, name: "Fokus", color: "#3b82f6" });
    await setTaskLabels(testDb, ada, work[0].id, [label.id]);
    await updateTask(testDb, ada, work[0].id, work[0].updatedAt.toISOString(), { priority: "high", dueDate: "2030-01-15" });
    const rows = await listMyWork(testDb, mia);
    expect(rows[0].labels).toEqual([{ id: label.id, name: "Fokus", color: "#3b82f6" }]);
    const view = myWorkView({ workQ: "ANGEBOT", workProject: p.project.id, workLabel: label.id, workPriority: "high", workDue: "today" });
    expect(filterMyWork(rows, view, "2030-01-15").map((t) => t.title)).toEqual(["Angebot"]);
    expect(filterMyWork(rows, { ...view, priority: "urgent" }, "2030-01-15")).toEqual([]);
    expect(filterMyWork(rows, { ...view, due: "none" }, "2030-01-15")).toEqual([]);
    expect(myWorkView({ workDue: "wrong", workSort: "wrong", workPriority: "wrong" })).toMatchObject({ due: "", sort: "due", priority: "" });
  });

  it("keeps time blocks private even from co-assignees, project owners and known-id requests", async () => {
    const { ada, mia, p, work } = await setup();
    const input = { projectId: p.project.id, taskId: work[0].id, personal: true, title: "Privater Fokus",
      startsAt: "2030-01-15T09:00", endsAt: "2030-01-15T10:00" };
    const block = await saveAppointment(testDb, mia, input);
    expect((await listAppointments(testDb, mia))[0]).toMatchObject({ id: block.id, isPersonal: true, canEdit: true });
    expect(await listAppointments(testDb, ada)).toEqual([]);
    expect(await listAppointments(testDb, ada, { projectId: p.project.id, taskId: work[0].id })).toEqual([]);
    expect((await getTaskDetail(testDb, ada, work[0].id))?.appointments).toEqual([]);
    await expect(saveAppointment(testDb, ada, input, block.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(deleteAppointment(testDb, ada, block.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(saveAppointment(testDb, mia, { ...input, personal: false }, block.id)).rejects.toMatchObject({ code: "VALIDATION" });
    expect((await getTaskDetail(testDb, mia, work[0].id))?.dueDate).toBeNull();
    await setTaskAssignees(testDb, ada, work[0].id, [ada.id]);
    await saveAppointment(testDb, mia, { ...input, title: "Angepasst" }, block.id);
    expect((await listAppointments(testDb, mia))[0].title).toBe("Angepasst");
    await deleteAppointment(testDb, mia, block.id);
    expect(await listAppointments(testDb, mia)).toEqual([]);
  });

  it("requires an own task for a private block while shared project appointments remain visible", async () => {
    const { ada, mia, p, work } = await setup();
    await setTaskAssignees(testDb, ada, work[0].id, [ada.id]);
    const input = { projectId: p.project.id, taskId: work[0].id, title: "Planung", startsAt: "2030-01-15T09:00", endsAt: "2030-01-15T10:00" };
    await expect(saveAppointment(testDb, mia, { ...input, personal: true })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(saveAppointment(testDb, mia, { ...input, personal: true, taskId: null })).rejects.toBeDefined();
    await saveAppointment(testDb, ada, input);
    expect((await listAppointments(testDb, mia))[0]).toMatchObject({ title: "Planung", isPersonal: false });
  });
});
