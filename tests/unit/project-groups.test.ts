import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { listCalendarTasks } from "@/server/calendar/service";
import { projectGroups, taskAssignees, users } from "@/server/db/schema";
import { addGroupMember, createGroup, deleteGroup, listGroups, removeGroupMember } from "@/server/groups/service";
import {
  addGroupToProject,
  changeProjectGroupRole,
  listProjectGroups,
  removeProjectGroup,
  searchAddableGroups,
} from "@/server/groups/project-groups";
import { addMemberByEmail, changeMemberRole, removeMember } from "@/server/members/service";
import { archiveProject } from "@/server/projects/lifecycle";
import { getProjectForUser, listMembers, listProjectsForUser } from "@/server/projects/service";
import { searchEverything } from "@/server/search/service";
import { loadTaskAccess } from "@/server/tasks/access";
import { getTaskDetail } from "@/server/tasks/queries";
import { setTaskAssignees } from "@/server/tasks/relations";
import { createTask } from "@/server/tasks/service";
import { resetDb, testDb } from "../helpers/db";
import { addMember, makeActor, makeProject } from "../helpers/fixtures";

const forbidden = { code: "FORBIDDEN" };
const notFound = { code: "NOT_FOUND" };

/** ada owns the project; the group "Marketing" holds ada, mia, gus and the deactivated off. */
async function setup() {
  const root = await makeActor("root@example.com", "admin");
  const ada = await makeActor("ada@example.com");
  const mia = await makeActor("mia@example.com");
  const gus = await makeActor("gus@example.com");
  const zed = await makeActor("zed@example.com");
  const { id: groupId } = await createGroup(testDb, root, "Marketing");
  for (const person of [ada, mia, gus]) await addGroupMember(testDb, root, groupId, person.id);
  const p = await makeProject(ada, "GRP");
  return { root, ada, mia, gus, zed, groupId, ...p };
}

const roleOf = async (actor: Awaited<ReturnType<typeof makeActor>>, projectId: string) => (await getProjectForUser(testDb, actor, projectId))?.memberRole ?? null;

describe("groups in projects: the group is the member, not a copy of its people", () => {
  beforeEach(resetDb);

  it("gives the group's people the role – and later joiners and leavers follow at once", async () => {
    const { root, ada, mia, gus, zed, groupId, project } = await setup();
    expect(await roleOf(mia, project.id)).toBeNull();
    expect(await addGroupToProject(testDb, ada, project.id, groupId, "guest")).toEqual({ size: 3 });
    expect(await roleOf(mia, project.id)).toBe("guest");
    expect(await roleOf(gus, project.id)).toBe("guest");
    expect(await roleOf(zed, project.id)).toBeNull();

    await addGroupMember(testDb, root, groupId, zed.id);
    expect(await roleOf(zed, project.id)).toBe("guest");
    expect((await listProjectsForUser(testDb, zed)).map((p) => p.key)).toEqual(["GRP"]);

    await removeGroupMember(testDb, root, groupId, gus.id);
    expect(await roleOf(gus, project.id)).toBeNull();
    expect(await listProjectsForUser(testDb, gus)).toEqual([]);
  });

  it("lists the members with where they come from", async () => {
    const { ada, mia, groupId, project } = await setup();
    await addGroupToProject(testDb, ada, project.id, groupId, "member");
    const members = await listMembers(testDb, project.id);
    expect(members.map((m) => [m.name, m.role, m.directRole, m.groups])).toEqual([
      ["ada", "owner", "owner", ["Marketing"]],
      ["gus", "member", null, ["Marketing"]],
      ["mia", "member", null, ["Marketing"]],
    ]);
    expect(await listProjectGroups(testDb, project.id)).toEqual([{ id: groupId, name: "Marketing", role: "member", size: 3 }]);
    expect(mia.id).toBeTruthy();
  });

  it("lets the highest role win between own membership and group", async () => {
    const { ada, mia, groupId, project } = await setup();
    await addGroupToProject(testDb, ada, project.id, groupId, "member");
    await addMember(project.id, mia, "guest");
    expect(await roleOf(mia, project.id)).toBe("member");
    await changeMemberRole(testDb, ada, project.id, mia.id, "owner");
    expect(await roleOf(mia, project.id)).toBe("owner");
    await removeMember(testDb, ada, project.id, mia.id);
    // Her own membership is gone, the group's is not.
    expect(await roleOf(mia, project.id)).toBe("member");
    await changeProjectGroupRole(testDb, ada, project.id, groupId, "guest");
    expect(await roleOf(mia, project.id)).toBe("guest");
  });

  it("never gives a group the owner role", async () => {
    const { ada, mia, groupId, project } = await setup();
    await expect(addGroupToProject(testDb, ada, project.id, groupId, "owner")).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(addGroupToProject(testDb, ada, project.id, groupId, "boss")).rejects.toMatchObject({ code: "VALIDATION" });
    await addGroupToProject(testDb, ada, project.id, groupId, "member");
    await expect(changeProjectGroupRole(testDb, ada, project.id, groupId, "owner")).rejects.toMatchObject({ code: "VALIDATION" });
    expect(await roleOf(mia, project.id)).toBe("member");
    expect(await testDb.select().from(projectGroups).where(eq(projectGroups.projectId, project.id))).toMatchObject([{ role: "member" }]);
  });

  it("rejects a group twice, unknown groups and malformed ids", async () => {
    const { ada, groupId, project } = await setup();
    await addGroupToProject(testDb, ada, project.id, groupId, "member");
    await expect(addGroupToProject(testDb, ada, project.id, groupId, "guest")).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(addGroupToProject(testDb, ada, project.id, "00000000-0000-4000-8000-000000000000", "member")).rejects.toMatchObject(notFound);
    await expect(addGroupToProject(testDb, ada, project.id, "kaputt", "member")).rejects.toMatchObject(notFound);
    await expect(changeProjectGroupRole(testDb, ada, project.id, "kaputt", "guest")).rejects.toMatchObject(notFound);
    await expect(removeProjectGroup(testDb, ada, project.id, "kaputt")).rejects.toMatchObject(notFound);
    await expect(removeProjectGroup(testDb, ada, project.id, "00000000-0000-4000-8000-000000000000")).rejects.toMatchObject(notFound);
  });

  it("lets only project owners (not even their group, not outsiders) manage the project's groups", async () => {
    const { root, ada, mia, zed, groupId, project } = await setup();
    const { id: other } = await createGroup(testDb, root, "Andere");
    await addGroupToProject(testDb, ada, project.id, groupId, "member");
    // mia is a plain member through the group.
    for (const actor of [mia]) {
      await expect(addGroupToProject(testDb, actor, project.id, other, "member")).rejects.toMatchObject(forbidden);
      await expect(changeProjectGroupRole(testDb, actor, project.id, groupId, "guest")).rejects.toMatchObject(forbidden);
      await expect(removeProjectGroup(testDb, actor, project.id, groupId)).rejects.toMatchObject(forbidden);
      await expect(searchAddableGroups(testDb, actor, project.id, "and")).rejects.toMatchObject(forbidden);
    }
    // zed sees nothing of the project at all, a global admin neither.
    for (const actor of [zed, root]) {
      await expect(addGroupToProject(testDb, actor, project.id, other, "member")).rejects.toMatchObject(notFound);
      await expect(removeProjectGroup(testDb, actor, project.id, groupId)).rejects.toMatchObject(notFound);
    }
    expect(await listProjectGroups(testDb, project.id)).toHaveLength(1);
  });

  it("keeps an archived project's groups as they are", async () => {
    const { ada, groupId, project } = await setup();
    await addGroupToProject(testDb, ada, project.id, groupId, "member");
    await archiveProject(testDb, ada, project.id);
    await expect(removeProjectGroup(testDb, ada, project.id, groupId)).rejects.toMatchObject(forbidden);
    await expect(changeProjectGroupRole(testDb, ada, project.id, groupId, "guest")).rejects.toMatchObject(forbidden);
  });

  it("suggests only groups that are not in the project yet, with their size", async () => {
    const { ada, groupId, project } = await setup();
    expect(await searchAddableGroups(testDb, ada, project.id, "")).toEqual([]);
    expect(await searchAddableGroups(testDb, ada, project.id, "mark")).toEqual([{ id: groupId, name: "Marketing", size: 3 }]);
    expect(await searchAddableGroups(testDb, ada, project.id, "zzz")).toEqual([]);
    expect(await searchAddableGroups(testDb, ada, project.id, "%")).toEqual([]);
    expect(await searchAddableGroups(testDb, ada, project.id, "", { browse: true })).toHaveLength(1);
    await addGroupToProject(testDb, ada, project.id, groupId, "member");
    expect(await searchAddableGroups(testDb, ada, project.id, "mark")).toEqual([]);
    expect(await searchAddableGroups(testDb, ada, project.id, "", { browse: true })).toEqual([]);
  });

  it("does not count deactivated people in the group size", async () => {
    const { root, ada, gus, groupId, project } = await setup();
    await testDb.update(users).set({ active: false }).where(eq(users.id, gus.id));
    expect(await addGroupToProject(testDb, ada, project.id, groupId, "member")).toEqual({ size: 2 });
    expect(root.id).toBeTruthy();
  });
});

describe("groups in projects: access follows the group everywhere", () => {
  beforeEach(resetDb);

  it("works like a membership for tasks, calendar and search – with the group's role", async () => {
    const { ada, mia, groupId, project } = await setup();
    const task = await createTask(testDb, ada, { projectId: project.id, title: "Gruppenaufgabe" });
    await addGroupToProject(testDb, ada, project.id, groupId, "member");
    expect((await loadTaskAccess(testDb, mia, task.id)).role).toBe("member");
    expect((await getTaskDetail(testDb, mia, task.id))?.canEdit).toBe(true);
    expect((await searchEverything(testDb, mia, "Gruppenaufgabe")).tasks).toHaveLength(1);
    await expect(createTask(testDb, mia, { projectId: project.id, title: "Von Mia" })).resolves.toBeTruthy();
    expect(await listCalendarTasks(testDb, mia, { from: "2000-01-01", to: "2100-01-01" })).toEqual([]);

    await changeProjectGroupRole(testDb, ada, project.id, groupId, "guest");
    expect((await getTaskDetail(testDb, mia, task.id))?.canEdit).toBe(false);
    await expect(createTask(testDb, mia, { projectId: project.id, title: "Nicht mehr" })).rejects.toMatchObject(forbidden);

    await removeProjectGroup(testDb, ada, project.id, groupId);
    expect(await getTaskDetail(testDb, mia, task.id)).toBeNull();
    expect((await searchEverything(testDb, mia, "Gruppenaufgabe")).tasks).toEqual([]);
    await expect(loadTaskAccess(testDb, mia, task.id)).rejects.toMatchObject(notFound);
  });

  it("allows assigning people who are in only through the group", async () => {
    const { ada, mia, groupId, project } = await setup();
    const task = await createTask(testDb, ada, { projectId: project.id, title: "Aufgabe" });
    await expect(setTaskAssignees(testDb, ada, task.id, [mia.id])).rejects.toThrow();
    await addGroupToProject(testDb, ada, project.id, groupId, "member");
    await setTaskAssignees(testDb, ada, task.id, [mia.id]);
    expect((await getTaskDetail(testDb, ada, task.id))?.assigneeIds).toEqual([mia.id]);
  });
});

describe("groups in projects: losing access drops the assignments", () => {
  beforeEach(resetDb);

  const assigneesOf = async (taskId: string) => (await testDb.select().from(taskAssignees).where(eq(taskAssignees.taskId, taskId))).map((row) => row.userId).sort();

  async function assigned() {
    const s = await setup();
    await addGroupToProject(testDb, s.ada, s.project.id, s.groupId, "member");
    const task = await createTask(testDb, s.ada, { projectId: s.project.id, title: "Aufgabe" });
    await setTaskAssignees(testDb, s.ada, task.id, [s.mia.id, s.gus.id]);
    return { ...s, task };
  }

  it("when someone leaves the group", async () => {
    const { root, mia, gus, groupId, task } = await assigned();
    await removeGroupMember(testDb, root, groupId, gus.id);
    expect(await assigneesOf(task.id)).toEqual([mia.id]);
  });

  it("when the group leaves the project – but not for people who also belong directly", async () => {
    const { ada, mia, gus, groupId, project, task } = await assigned();
    await addMember(project.id, mia, "member");
    await removeProjectGroup(testDb, ada, project.id, groupId);
    expect(await assigneesOf(task.id)).toEqual([mia.id]);
    expect(await roleOf(mia, project.id)).toBe("member");
    expect(await roleOf(gus, project.id)).toBeNull();
  });

  it("when the group is deleted, which also lists the affected projects beforehand", async () => {
    const { root, ada, mia, gus, groupId, project, task } = await assigned();
    expect((await listGroups(testDb, root))[0].projects).toEqual([{ id: project.id, name: "Projekt GRP" }]);
    await deleteGroup(testDb, root, groupId);
    expect(await assigneesOf(task.id)).toEqual([]);
    expect(await roleOf(mia, project.id)).toBeNull();
    expect(await roleOf(gus, project.id)).toBeNull();
    expect(await roleOf(ada, project.id)).toBe("owner");
    expect(await testDb.select().from(projectGroups)).toEqual([]);
  });

  it("keeps assignments when a directly added member is removed but is still in through the group", async () => {
    const { ada, mia, project, task } = await assigned();
    await addMemberByEmail(testDb, ada, project.id, mia.email, "guest");
    await removeMember(testDb, ada, project.id, mia.id);
    expect(await assigneesOf(task.id)).toContain(mia.id);
    expect(await roleOf(mia, project.id)).toBe("member");
  });
});
