import { beforeEach, describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { listActivity } from "@/server/activity/service";
import { createLabel, deleteLabel, listLabels } from "@/server/labels/service";
import { setTaskAssignees, setTaskLabels } from "@/server/tasks/relations";
import { createTask } from "@/server/tasks/service";
import { getTaskDetail } from "@/server/tasks/queries";
import { resetDb, testDb } from "../helpers/db";
import { addMember, makeActor, makeProject } from "../helpers/fixtures";

describe("labels", () => {
  beforeEach(resetDb);

  it("lets owners create, list (by name) and delete labels", async () => {
    const ada = await makeActor("ada@example.com");
    const { project } = await makeProject(ada, "LAB");
    await createLabel(testDb, ada, { projectId: project.id, name: " Frontend ", color: "#3b82f6" });
    const design = await createLabel(testDb, ada, { projectId: project.id, name: "Design", color: "#a855f7" });
    expect((await listLabels(testDb, project.id)).map((l) => l.name)).toEqual(["Design", "Frontend"]);
    await deleteLabel(testDb, ada, design.id);
    expect((await listLabels(testDb, project.id)).map((l) => l.name)).toEqual(["Frontend"]);
  });

  it("reports duplicates case-insensitively as LABEL_TAKEN and rejects unknown colors", async () => {
    const ada = await makeActor("ada@example.com");
    const { project } = await makeProject(ada, "DUP");
    await createLabel(testDb, ada, { projectId: project.id, name: "Design", color: "#3b82f6" });
    await expect(
      createLabel(testDb, ada, { projectId: project.id, name: "DESIGN", color: "#3b82f6" }),
    ).rejects.toMatchObject({ code: "LABEL_TAKEN" });
    await expect(
      createLabel(testDb, ada, { projectId: project.id, name: "X", color: "#123456" }),
    ).rejects.toBeInstanceOf(ZodError);
  });

  it("allows only owners/admins to manage labels", async () => {
    const ada = await makeActor("ada@example.com");
    const mia = await makeActor("mia@example.com");
    const { project } = await makeProject(ada, "OWN");
    await addMember(project.id, mia, "member");
    await expect(
      createLabel(testDb, mia, { projectId: project.id, name: "X", color: "#3b82f6" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const label = await createLabel(testDb, ada, { projectId: project.id, name: "X", color: "#3b82f6" });
    await expect(deleteLabel(testDb, mia, label.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(deleteLabel(testDb, mia, "kaputt")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("task relations", () => {
  beforeEach(resetDb);

  it("replaces assignees and labels and logs added/removed", async () => {
    const ada = await makeActor("ada@example.com");
    const mia = await makeActor("mia@example.com");
    const { project } = await makeProject(ada, "REL");
    await addMember(project.id, mia, "member");
    const label = await createLabel(testDb, ada, { projectId: project.id, name: "Design", color: "#3b82f6" });
    const task = await createTask(testDb, ada, { projectId: project.id, title: "T" });

    await setTaskAssignees(testDb, ada, task.id, [ada.id, mia.id]);
    await setTaskAssignees(testDb, ada, task.id, [mia.id]);
    await setTaskLabels(testDb, ada, task.id, [label.id]);

    const detail = await getTaskDetail(testDb, ada, task.id);
    expect(detail?.assigneeIds).toEqual([mia.id]);
    expect(detail?.labelIds).toEqual([label.id]);
    const log = await listActivity(testDb, task.id);
    expect(log.filter((e) => e.action === "task.assigneesChanged").map((e) => e.diff)).toEqual([
      { added: [ada.id, mia.id], removed: [] },
      { added: [], removed: [ada.id] },
    ]);
  });

  it("does not log when the set is unchanged and ignores duplicate ids", async () => {
    const ada = await makeActor("ada@example.com");
    const { project } = await makeProject(ada, "NOP");
    const task = await createTask(testDb, ada, { projectId: project.id, title: "T" });
    await setTaskAssignees(testDb, ada, task.id, [ada.id, ada.id]);
    await setTaskAssignees(testDb, ada, task.id, [ada.id]);
    const log = await listActivity(testDb, task.id);
    expect(log.filter((e) => e.action === "task.assigneesChanged")).toHaveLength(1);
  });

  it("rejects non-members and labels from other projects", async () => {
    const ada = await makeActor("ada@example.com");
    const fremd = await makeActor("fremd@example.com");
    const a = await makeProject(ada, "PRA");
    const b = await makeProject(ada, "PRB");
    const foreignLabel = await createLabel(testDb, ada, { projectId: b.project.id, name: "B", color: "#3b82f6" });
    const task = await createTask(testDb, ada, { projectId: a.project.id, title: "T" });
    await expect(setTaskAssignees(testDb, ada, task.id, [fremd.id])).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(setTaskAssignees(testDb, ada, task.id, ["kaputt"])).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(setTaskLabels(testDb, ada, task.id, [foreignLabel.id])).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("forbids guests", async () => {
    const ada = await makeActor("ada@example.com");
    const gast = await makeActor("gast@example.com");
    const { project } = await makeProject(ada, "GST");
    await addMember(project.id, gast, "guest");
    const task = await createTask(testDb, ada, { projectId: project.id, title: "T" });
    await expect(setTaskAssignees(testDb, gast, task.id, [gast.id])).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
