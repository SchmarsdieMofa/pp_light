import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { taskAssignees } from "@/server/db/schema";
import {
  addFolderGroup,
  addFolderMemberByEmail,
  changeFolderGroupRole,
  changeFolderMemberRole,
  createFolder,
  deleteFolder,
  getFolderDetail,
  listFolders,
  moveProjectToFolder,
  removeFolderGroup,
  removeFolderMember,
  renameFolder,
  searchFolderGroups,
  searchFolderUsers,
} from "@/server/folders/service";
import { addGroupMember, createGroup } from "@/server/groups/service";
import { createProject, getProjectForUser, listMembers, listProjectsForUser } from "@/server/projects/service";
import { setTaskAssignees } from "@/server/tasks/relations";
import { createTask } from "@/server/tasks/service";
import { resetDb, testDb } from "../helpers/db";
import { addMember, makeActor, makeProject } from "../helpers/fixtures";

const forbidden = { code: "FORBIDDEN" };
const notFound = { code: "NOT_FOUND" };

async function setup() {
  const root = await makeActor("root@example.com", "admin");
  const ada = await makeActor("ada@example.com");
  const mia = await makeActor("mia@example.com");
  const gus = await makeActor("gus@example.com");
  const zed = await makeActor("zed@example.com");
  const { id: folderId } = await createFolder(testDb, ada, "Kunden");
  return { root, ada, mia, gus, zed, folderId };
}

const roleOf = async (actor: Awaited<ReturnType<typeof makeActor>>, projectId: string) => (await getProjectForUser(testDb, actor, projectId))?.memberRole ?? null;

describe("project folders", () => {
  beforeEach(resetDb);

  it("makes the creator owner; only people in the folder see it", async () => {
    const { ada, mia, folderId } = await setup();
    expect((await listFolders(testDb, ada)).map((f) => [f.name, f.role])).toEqual([["Kunden", "owner"]]);
    expect(await listFolders(testDb, mia)).toEqual([]);
    await expect(getFolderDetail(testDb, mia, folderId)).rejects.toMatchObject(notFound);
    await expect(createFolder(testDb, ada, "  ")).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("gives folder people their role in every project of the folder, new ones included, live", async () => {
    const { ada, mia, gus, zed, folderId } = await setup();
    const first = await createProject(testDb, ada, { name: "Eins", key: "ONE", folderId });
    await addFolderMemberByEmail(testDb, ada, folderId, mia.email, "member");
    await addFolderMemberByEmail(testDb, ada, folderId, gus.email, "guest");
    const second = await createProject(testDb, ada, { name: "Zwei", key: "TWO", folderId });
    for (const project of [first, second]) {
      expect(await roleOf(mia, project.id)).toBe("member");
      expect(await roleOf(gus, project.id)).toBe("guest");
      expect(await roleOf(zed, project.id)).toBeNull();
    }
    expect((await listProjectsForUser(testDb, mia)).map((p) => p.key).sort()).toEqual(["ONE", "TWO"]);
    await changeFolderMemberRole(testDb, ada, folderId, mia.id, "guest");
    expect(await roleOf(mia, first.id)).toBe("guest");
    await removeFolderMember(testDb, ada, folderId, mia.id);
    expect(await roleOf(mia, first.id)).toBeNull();
  });

  it("is additive: a folder owner owns every project, a direct role can add to it, nothing is taken away", async () => {
    const { ada, mia, zed, folderId } = await setup();
    await addFolderMemberByEmail(testDb, ada, folderId, mia.email, "owner");
    const foreign = await createProject(testDb, zed, { name: "Von Zed", key: "ZED" });
    // zed has no role in the folder: it does not exist for him, he cannot pull his project in.
    await expect(moveProjectToFolder(testDb, zed, foreign.id, folderId)).rejects.toMatchObject(notFound);
    // ada puts her own project in; mia (folder owner) now owns it; a direct guest role does not lower that.
    const own = await createProject(testDb, ada, { name: "Von Ada", key: "ADA" });
    await moveProjectToFolder(testDb, ada, own.id, folderId);
    expect(await roleOf(mia, own.id)).toBe("owner");
    await addMember(own.id, mia, "guest");
    expect(await roleOf(mia, own.id)).toBe("owner");
    // A direct member of a project in the folder who is not in the folder only sees that project.
    await addMember(own.id, zed, "member");
    expect(await roleOf(zed, own.id)).toBe("member");
    expect(await listFolders(testDb, zed)).toEqual([]);
    const other = await createProject(testDb, ada, { name: "Nebenan", key: "NEB", folderId });
    expect(await roleOf(zed, other.id)).toBeNull();
  });

  it("shows who is in a project through the folder", async () => {
    const { ada, mia, folderId } = await setup();
    await addFolderMemberByEmail(testDb, ada, folderId, mia.email, "member");
    const project = await createProject(testDb, ada, { name: "Eins", key: "ONE", folderId });
    const members = await listMembers(testDb, project.id);
    expect(members.find((m) => m.id === mia.id)).toMatchObject({ role: "member", directRole: null, viaFolder: true });
    expect(members.find((m) => m.id === ada.id)).toMatchObject({ role: "owner", directRole: "owner", viaFolder: true });
  });

  it("groups are in the folder as member or guest, never owner, and follow the group", async () => {
    const { root, ada, mia, gus, folderId } = await setup();
    const { id: groupId } = await createGroup(testDb, root, "Vertrieb");
    await addGroupMember(testDb, root, groupId, mia.id);
    const project = await createProject(testDb, ada, { name: "Eins", key: "ONE", folderId });
    await expect(addFolderGroup(testDb, ada, folderId, groupId, "owner")).rejects.toMatchObject({ code: "VALIDATION" });
    expect(await addFolderGroup(testDb, ada, folderId, groupId, "member")).toEqual({ size: 1 });
    await expect(addFolderGroup(testDb, ada, folderId, groupId, "member")).rejects.toMatchObject({ code: "VALIDATION" });
    expect(await roleOf(mia, project.id)).toBe("member");
    await addGroupMember(testDb, root, groupId, gus.id);
    expect(await roleOf(gus, project.id)).toBe("member");
    await changeFolderGroupRole(testDb, ada, folderId, groupId, "guest");
    expect(await roleOf(gus, project.id)).toBe("guest");
    expect((await getFolderDetail(testDb, ada, folderId)).groups).toMatchObject([{ name: "Vertrieb", role: "guest", size: 2 }]);
    await removeFolderGroup(testDb, ada, folderId, groupId);
    expect(await roleOf(gus, project.id)).toBeNull();
  });

  it("only folder owners manage the folder; the last owner stays", async () => {
    const { ada, mia, gus, folderId } = await setup();
    await addFolderMemberByEmail(testDb, ada, folderId, mia.email, "member");
    for (const attempt of [
      () => renameFolder(testDb, mia, folderId, "X"),
      () => addFolderMemberByEmail(testDb, mia, folderId, gus.email, "guest"),
      () => removeFolderMember(testDb, mia, folderId, ada.id),
      () => deleteFolder(testDb, mia, folderId),
      () => searchFolderUsers(testDb, mia, folderId, "gus"),
      () => searchFolderGroups(testDb, mia, folderId, "x"),
    ]) await expect(attempt()).rejects.toMatchObject(forbidden);
    await expect(removeFolderMember(testDb, ada, folderId, ada.id)).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(changeFolderMemberRole(testDb, ada, folderId, ada.id, "member")).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(addFolderMemberByEmail(testDb, ada, folderId, mia.email, "guest")).rejects.toMatchObject({ code: "VALIDATION" });
    await renameFolder(testDb, ada, folderId, " Kunden A bis Z ");
    expect((await getFolderDetail(testDb, mia, folderId)).name).toBe("Kunden A bis Z");
    expect((await searchFolderUsers(testDb, ada, folderId, "gus")).map((u) => u.email)).toEqual([gus.email]);
    expect(await searchFolderUsers(testDb, ada, folderId, "mia")).toEqual([]);
  });

  it("lets guests of a folder look, but not create or fill", async () => {
    const { ada, gus, folderId } = await setup();
    await addFolderMemberByEmail(testDb, ada, folderId, gus.email, "guest");
    await expect(createProject(testDb, gus, { name: "Nein", key: "NO", folderId })).rejects.toMatchObject(forbidden);
    const mine = await createProject(testDb, gus, { name: "Meins", key: "MINE" });
    await expect(moveProjectToFolder(testDb, gus, mine.id, folderId)).rejects.toMatchObject(forbidden);
    // Unknown folders do not exist for the actor.
    await expect(createProject(testDb, ada, { name: "Weg", key: "WEG", folderId: "00000000-0000-4000-8000-000000000000" })).rejects.toMatchObject(notFound);
  });

  it("moving a project out, or deleting the folder, ends access that came only from the folder", async () => {
    const { ada, mia, zed, folderId } = await setup();
    await addFolderMemberByEmail(testDb, ada, folderId, mia.email, "member");
    const project = await createProject(testDb, ada, { name: "Eins", key: "ONE", folderId });
    const task = await createTask(testDb, ada, { projectId: project.id, title: "T" });
    await setTaskAssignees(testDb, ada, task.id, [mia.id]);
    await addMember(project.id, zed, "member");
    await moveProjectToFolder(testDb, ada, project.id, null);
    expect(await roleOf(mia, project.id)).toBeNull();
    expect(await roleOf(zed, project.id)).toBe("member");
    expect(await testDb.select().from(taskAssignees).where(eq(taskAssignees.taskId, task.id))).toEqual([]);

    // Deleting the folder keeps its projects.
    const again = await createProject(testDb, ada, { name: "Zwei", key: "TWO", folderId });
    const second = await createTask(testDb, ada, { projectId: again.id, title: "U" });
    await setTaskAssignees(testDb, ada, second.id, [mia.id]);
    await deleteFolder(testDb, ada, folderId);
    expect(await roleOf(ada, again.id)).toBe("owner");
    expect(await roleOf(mia, again.id)).toBeNull();
    expect(await testDb.select().from(taskAssignees).where(eq(taskAssignees.taskId, second.id))).toEqual([]);
    expect(await listFolders(testDb, ada)).toEqual([]);
  });

  it("only a project's owner moves it", async () => {
    const { ada, mia, folderId } = await setup();
    const { project } = await makeProject(ada, "MOV");
    await addMember(project.id, mia, "member");
    await expect(moveProjectToFolder(testDb, mia, project.id, folderId)).rejects.toMatchObject(forbidden);
    await moveProjectToFolder(testDb, ada, project.id, folderId);
    await moveProjectToFolder(testDb, ada, project.id, folderId);
    expect((await getFolderDetail(testDb, ada, folderId)).projects.map((p) => p.key)).toEqual(["MOV"]);
  });
});
