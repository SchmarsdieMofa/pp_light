import { beforeEach, describe, expect, it } from "vitest";
import { listPinnedProjectIds, setProjectPinned } from "@/server/projects/pins";
import { resetDb, testDb } from "../helpers/db";
import { makeActor, makeProject } from "../helpers/fixtures";

describe("project pins", () => {
  beforeEach(resetDb);

  it("pins and unpins per person, repeating is harmless", async () => {
    const ada = await makeActor("ada@example.com");
    const bob = await makeActor("bob@example.com");
    const { project: first } = await makeProject(ada, "ONE");
    const { project: second } = await makeProject(ada, "TWO");
    await setProjectPinned(testDb, ada, first.id, true);
    await setProjectPinned(testDb, ada, first.id, true);
    await setProjectPinned(testDb, ada, second.id, true);
    expect(await listPinnedProjectIds(testDb, ada.id)).toEqual([first.id, second.id]);
    expect(await listPinnedProjectIds(testDb, bob.id)).toEqual([]);
    await setProjectPinned(testDb, ada, first.id, false);
    await setProjectPinned(testDb, ada, first.id, false);
    expect(await listPinnedProjectIds(testDb, ada.id)).toEqual([second.id]);
  });

  it("refuses projects the person cannot see and does not leak that they exist", async () => {
    const ada = await makeActor("ada@example.com");
    const fremd = await makeActor("fremd@example.com");
    const { project } = await makeProject(ada, "PRV");
    await expect(setProjectPinned(testDb, fremd, project.id, true)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(setProjectPinned(testDb, ada, "kaputt", true)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await listPinnedProjectIds(testDb, fremd.id)).toEqual([]);
  });

  it("drops the pin when the project is deleted", async () => {
    const ada = await makeActor("ada@example.com");
    const { project } = await makeProject(ada, "DEL");
    await setProjectPinned(testDb, ada, project.id, true);
    await testDb.$client.query("delete from projects where id = $1", [project.id]);
    expect(await listPinnedProjectIds(testDb, ada.id)).toEqual([]);
  });
});
