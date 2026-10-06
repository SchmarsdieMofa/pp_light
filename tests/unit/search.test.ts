import { beforeEach, describe, expect, it } from "vitest";
import { removeMember } from "@/server/members/service";
import { searchEverything } from "@/server/search/service";
import { createTask, updateTask } from "@/server/tasks/service";
import { resetDb, testDb } from "../helpers/db";
import { addMember, makeActor, makeProject } from "../helpers/fixtures";

async function setup() {
  const ada = await makeActor("ada@example.com");
  const mia = await makeActor("mia@example.com");
  const web = await makeProject(ada, "WEB");
  const other = await makeProject(ada, "OPS");
  await addMember(web.project.id, mia, "member");
  const header = await createTask(testDb, ada, { projectId: web.project.id, title: "Header bauen" });
  await updateTask(testDb, ada, header.id, header.updatedAt.toISOString(), { description: "Navigation mit Logo und Suchfeld" });
  await createTask(testDb, ada, { projectId: web.project.id, title: "Rabatt 100% prüfen" });
  await createTask(testDb, ada, { projectId: other.project.id, title: "Server Logo tauschen" });
  return { ada, mia, web, other };
}

const titles = (r: Awaited<ReturnType<typeof searchEverything>>) => r.tasks.map((t) => t.title);

describe("searchEverything", () => {
  beforeEach(resetDb);

  it("finds tasks by German full text in title and description", async () => {
    const { ada } = await setup();
    expect(titles(await searchEverything(testDb, ada, "Navigationen"))).toEqual(["Header bauen"]);
    expect(titles(await searchEverything(testDb, ada, "logo")).sort()).toEqual(["Header bauen", "Server Logo tauschen"]);
  });

  it("finds by title prefix, by number and by key-number", async () => {
    const { ada } = await setup();
    expect(titles(await searchEverything(testDb, ada, "Hea"))).toEqual(["Header bauen"]);
    expect(titles(await searchEverything(testDb, ada, "WEB-2"))).toEqual(["Rabatt 100% prüfen"]);
    expect(titles(await searchEverything(testDb, ada, "OPS-1"))).toEqual(["Server Logo tauschen"]);
  });

  it("finds subtasks by their hierarchical number", async () => {
    const { ada, web } = await setup();
    const [header] = (await searchEverything(testDb, ada, "WEB-1")).tasks;
    const sub = await createTask(testDb, ada, { projectId: web.project.id, title: "Teilstück", parentId: header.id });
    await createTask(testDb, ada, { projectId: web.project.id, title: "Unterteilstück", parentId: sub.id });
    expect(titles(await searchEverything(testDb, ada, "WEB-1.1"))).toEqual(["Teilstück"]);
    expect(titles(await searchEverything(testDb, ada, "web-1.1.1"))).toEqual(["Unterteilstück"]);
    expect(titles(await searchEverything(testDb, ada, "1.2"))).toEqual([]);
  });

  it("finds projects by name or key", async () => {
    const { ada } = await setup();
    expect((await searchEverything(testDb, ada, "ops")).projects.map((p) => p.key)).toEqual(["OPS"]);
    expect((await searchEverything(testDb, ada, "Projekt WEB")).projects.map((p) => p.key)).toEqual(["WEB"]);
  });

  it("only shows projects I can see, also after removal", async () => {
    const { ada, mia, web } = await setup();
    expect(titles(await searchEverything(testDb, mia, "logo"))).toEqual(["Header bauen"]);
    expect((await searchEverything(testDb, mia, "OPS")).projects).toEqual([]);
    await removeMember(testDb, ada, web.project.id, mia.id);
    expect(await searchEverything(testDb, mia, "logo")).toEqual({ tasks: [], projects: [] });
  });

  it("handles special characters and empty input without errors", async () => {
    const { ada } = await setup();
    expect(titles(await searchEverything(testDb, ada, "100%"))).toEqual(["Rabatt 100% prüfen"]);
    for (const q of ["%", "_", "'", ":*", "&", "!(", "x".repeat(500), "   ", "a & | ! <-> b"]) {
      await expect(searchEverything(testDb, ada, q)).resolves.toBeDefined();
    }
    expect(await searchEverything(testDb, ada, "   ")).toEqual({ tasks: [], projects: [] });
  });
});
