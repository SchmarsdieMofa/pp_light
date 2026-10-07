import { beforeEach, describe, expect, it } from "vitest";
import { ZodError } from "zod";
import {
  addChecklistItem,
  deleteChecklistItem,
  listChecklist,
  reorderChecklist,
  setChecklistItemDone,
  setChecklistItemText,
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

  it("edits the text and reorders items", async () => {
    const ada = await makeActor("ada@example.com");
    const gast = await makeActor("gast@example.com");
    const { project } = await makeProject(ada, "ORD");
    await addMember(project.id, gast, "guest");
    const task = await createTask(testDb, ada, { projectId: project.id, title: "T" });
    const other = await createTask(testDb, ada, { projectId: project.id, title: "U" });
    const [a, b, c] = [await addChecklistItem(testDb, ada, task.id, "A"), await addChecklistItem(testDb, ada, task.id, "B"), await addChecklistItem(testDb, ada, task.id, "C")];
    await setChecklistItemText(testDb, ada, b.id, "  Bee ");
    await reorderChecklist(testDb, ada, task.id, [c.id, a.id, b.id]);
    expect((await listChecklist(testDb, task.id)).map((i) => i.text)).toEqual(["C", "A", "Bee"]);
    // New items still go to the end after a reorder.
    await addChecklistItem(testDb, ada, task.id, "D");
    expect((await listChecklist(testDb, task.id)).map((i) => i.text)).toEqual(["C", "A", "Bee", "D"]);
    await expect(setChecklistItemText(testDb, ada, a.id, " ")).rejects.toBeInstanceOf(ZodError);
    await expect(setChecklistItemText(testDb, gast, a.id, "X")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(reorderChecklist(testDb, gast, task.id, [a.id])).rejects.toMatchObject({ code: "FORBIDDEN" });
    // A stale or foreign list is refused and changes nothing.
    await expect(reorderChecklist(testDb, ada, task.id, [a.id, b.id, c.id])).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(reorderChecklist(testDb, ada, other.id, [a.id])).rejects.toMatchObject({ code: "CONFLICT" });
    expect((await listChecklist(testDb, task.id)).map((i) => i.text)).toEqual(["C", "A", "Bee", "D"]);
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
