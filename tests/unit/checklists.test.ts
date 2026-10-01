import { beforeEach, describe, expect, it } from "vitest";
import { ZodError } from "zod";
import {
  addChecklistItem,
  deleteChecklistItem,
  listChecklist,
  setChecklistItemDone,
} from "@/server/checklists/service";
import { createTask } from "@/server/tasks/service";
import { resetDb, testDb } from "../helpers/db";
import { addMember, makeActor, makeProject } from "../helpers/fixtures";

describe("checklists", () => {
  beforeEach(resetDb);

  it("adds items in order, toggles and deletes them", async () => {
    const ada = await makeActor("ada@example.com");
    const { project } = await makeProject(ada, "CHK");
    const task = await createTask(testDb, ada, { projectId: project.id, title: "T" });
    const a = await addChecklistItem(testDb, ada, task.id, " Logo ");
    await addChecklistItem(testDb, ada, task.id, "Farben");
    await setChecklistItemDone(testDb, ada, a.id, true);
    expect((await listChecklist(testDb, task.id)).map((i) => [i.text, i.done])).toEqual([
      ["Logo", true],
      ["Farben", false],
    ]);
    await deleteChecklistItem(testDb, ada, a.id);
    expect((await listChecklist(testDb, task.id)).map((i) => i.text)).toEqual(["Farben"]);
  });

  it("validates text and ids", async () => {
    const ada = await makeActor("ada@example.com");
    const { project } = await makeProject(ada, "VAL");
    const task = await createTask(testDb, ada, { projectId: project.id, title: "T" });
    await expect(addChecklistItem(testDb, ada, task.id, "  ")).rejects.toBeInstanceOf(ZodError);
    await expect(setChecklistItemDone(testDb, ada, "kaputt", true)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("forbids guests and hides items from non-members", async () => {
    const ada = await makeActor("ada@example.com");
    const gast = await makeActor("gast@example.com");
    const fremd = await makeActor("fremd@example.com");
    const { project } = await makeProject(ada, "GST");
    await addMember(project.id, gast, "guest");
    const task = await createTask(testDb, ada, { projectId: project.id, title: "T" });
    const item = await addChecklistItem(testDb, ada, task.id, "Punkt");
    await expect(addChecklistItem(testDb, gast, task.id, "X")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(setChecklistItemDone(testDb, gast, item.id, true)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(deleteChecklistItem(testDb, fremd, item.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
