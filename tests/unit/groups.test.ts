import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { projectMembers, users } from "@/server/db/schema";
import {
  addGroupMember,
  addGroupToProject,
  createGroup,
  deleteGroup,
  listGroups,
  removeGroupMember,
  renameGroup,
  searchAddableGroups,
} from "@/server/groups/service";
import { listMembers } from "@/server/projects/service";
import { resetDb, testDb } from "../helpers/db";
import { makeActor, makeProject } from "../helpers/fixtures";

async function setup() {
  const root = await makeActor("root@example.com", "admin");
  const ada = await makeActor("ada@example.com");
  const mia = await makeActor("mia@example.com");
  const gus = await makeActor("gus@example.com");
  const off = await makeActor("off@example.com");
  await testDb.update(users).set({ active: false }).where(eq(users.id, off.id));
  const { id: groupId } = await createGroup(testDb, root, "Marketing");
  for (const person of [ada, mia, gus, off]) await addGroupMember(testDb, root, groupId, person.id);
  const { project } = await makeProject(ada, "GRP");
  return { root, ada, mia, gus, off, groupId, project };
}

describe("groups", () => {
  beforeEach(resetDb);

  it("lets only admins manage groups", async () => {
    const { ada, groupId, mia } = await setup();
    await expect(createGroup(testDb, ada, "Neu")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(listGroups(testDb, ada)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(addGroupMember(testDb, ada, groupId, mia.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(deleteGroup(testDb, ada, groupId)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("creates, renames, fills and deletes groups; names are unique ignoring case", async () => {
    const root = await makeActor("root@example.com", "admin");
    const mia = await makeActor("mia@example.com");
    const { id } = await createGroup(testDb, root, "  Vertrieb ");
    await expect(createGroup(testDb, root, "vertrieb")).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(createGroup(testDb, root, "   ")).rejects.toMatchObject({ code: "VALIDATION" });
    await renameGroup(testDb, root, id, "Verkauf");
    await addGroupMember(testDb, root, id, mia.id);
    await addGroupMember(testDb, root, id, mia.id);
    expect(await listGroups(testDb, root)).toMatchObject([{ name: "Verkauf", members: [{ email: "mia@example.com" }] }]);
    await removeGroupMember(testDb, root, id, mia.id);
    expect((await listGroups(testDb, root))[0].members).toEqual([]);
    await deleteGroup(testDb, root, id);
    expect(await listGroups(testDb, root)).toEqual([]);
    await expect(deleteGroup(testDb, root, id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(addGroupMember(testDb, root, "kaputt", mia.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("adds the active, not yet present people of a group to a project", async () => {
    const { ada, mia, groupId, project } = await setup();
    const result = await addGroupToProject(testDb, ada, project.id, groupId, "guest");
    expect(result).toEqual({ added: 2 });
    expect((await listMembers(testDb, project.id)).map((m) => [m.name, m.role]).sort()).toEqual([["ada", "owner"], ["gus", "guest"], ["mia", "guest"]]);
    expect(await addGroupToProject(testDb, ada, project.id, groupId, "member")).toEqual({ added: 0 });
    expect((await listMembers(testDb, project.id)).find((m) => m.id === mia.id)?.role).toBe("guest");
  });

  it("only lets owners use groups for a project", async () => {
    const { mia, groupId, project } = await setup();
    await expect(addGroupToProject(testDb, mia, project.id, groupId, "member")).rejects.toMatchObject({ code: "NOT_FOUND" });
    await testDb.insert(projectMembers).values({ projectId: project.id, userId: mia.id, role: "member" });
    await expect(addGroupToProject(testDb, mia, project.id, groupId, "member")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(searchAddableGroups(testDb, mia, project.id, "mark")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("suggests groups by name with the number of people still to add", async () => {
    const { ada, groupId, project } = await setup();
    expect(await searchAddableGroups(testDb, ada, project.id, "")).toEqual([]);
    expect(await searchAddableGroups(testDb, ada, project.id, "mark")).toEqual([{ id: groupId, name: "Marketing", addable: 2 }]);
    expect(await searchAddableGroups(testDb, ada, project.id, "zzz")).toEqual([]);
    expect(await searchAddableGroups(testDb, ada, project.id, "%")).toEqual([]);
    expect(await searchAddableGroups(testDb, ada, project.id, "", { browse: true })).toHaveLength(1);
    await addGroupToProject(testDb, ada, project.id, groupId, "member");
    expect((await searchAddableGroups(testDb, ada, project.id, "mark"))[0].addable).toBe(0);
  });
});
