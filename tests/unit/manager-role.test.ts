import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { GlobalRole } from "@/lib/enums";
import { resolveActor } from "@/server/auth/actor";
import { listBackupRuns, requestBackup } from "@/server/backups/service";
import { listCalendarTasks } from "@/server/calendar/service";
import { authTokens, mailOutbox, users } from "@/server/db/schema";
import { addGroupMember, createGroup, deleteGroup, listGroups, removeGroupMember, renameGroup } from "@/server/groups/service";
import { addGroupToProject } from "@/server/groups/project-groups";
import { addMemberByEmail } from "@/server/members/service";
import { getProjectForUser, listProjectsForUser } from "@/server/projects/service";
import { updateProjectDetails } from "@/server/projects/lifecycle";
import { searchEverything } from "@/server/search/service";
import { setBaseUrl, setHttpsOnly } from "@/server/settings/service";
import { createTask } from "@/server/tasks/service";
import { setUserRole } from "@/server/users/account";
import { inviteUser, listUsers, revokeInvitation, setUserActive } from "@/server/users/invitations";
import { resetDb, testDb } from "../helpers/db";
import { addMember, makeActor, makeProject } from "../helpers/fixtures";

const forbidden = { code: "FORBIDDEN" };

async function setup() {
  const admin = await makeActor("admin@example.com", "admin");
  const admin2 = await makeActor("admin2@example.com", "admin");
  const manager = await makeActor("manager@example.com", "manager");
  const manager2 = await makeActor("manager2@example.com", "manager");
  const member = await makeActor("member@example.com", "member");
  const member2 = await makeActor("member2@example.com", "member");
  return { admin, admin2, manager, manager2, member, member2 };
}

const roleOf = async (id: string) => (await testDb.select({ role: users.role }).from(users).where(eq(users.id, id)))[0].role;
const activeOf = async (id: string) => (await testDb.select({ active: users.active }).from(users).where(eq(users.id, id)))[0].active;

describe("manager role: inviting", () => {
  beforeEach(resetDb);

  it("lets a manager invite members – and only members", async () => {
    const { manager } = await setup();
    await inviteUser(testDb, manager, { email: "new@example.com", name: "Neu", role: "member" });
    expect((await testDb.select().from(users).where(eq(users.email, "new@example.com")))[0]).toMatchObject({ role: "member", active: false });
    expect(await testDb.select().from(mailOutbox)).toHaveLength(1);
    for (const role of ["manager", "admin"] as GlobalRole[]) {
      await expect(inviteUser(testDb, manager, { email: `neu-${role}@example.com`, name: "X", role })).rejects.toMatchObject(forbidden);
      expect(await testDb.select().from(users).where(eq(users.email, `neu-${role}@example.com`))).toEqual([]);
    }
  });

  it("lets admins invite every role and members nobody", async () => {
    const { admin, member } = await setup();
    for (const role of ["member", "manager", "admin"] as GlobalRole[]) {
      await inviteUser(testDb, admin, { email: `${role}-neu@example.com`, name: "X", role });
      expect((await testDb.select().from(users).where(eq(users.email, `${role}-neu@example.com`)))[0].role).toBe(role);
    }
    await expect(inviteUser(testDb, member, { email: "x@example.com", name: "X", role: "member" })).rejects.toMatchObject(forbidden);
  });

  it("does not let a manager re-invite (and so rewrite) an inactive manager or admin account", async () => {
    const { manager, admin } = await setup();
    const sleeper = await makeActor("sleeper@example.com", "admin");
    await testDb.update(users).set({ active: false }).where(eq(users.id, sleeper.id));
    await expect(inviteUser(testDb, manager, { email: "sleeper@example.com", name: "Gekapert", role: "member" })).rejects.toMatchObject(forbidden);
    expect((await testDb.select().from(users).where(eq(users.id, sleeper.id)))[0]).toMatchObject({ role: "admin", name: "sleeper" });
    expect(await testDb.select().from(mailOutbox)).toEqual([]);
    expect(await testDb.select().from(authTokens)).toEqual([]);
    // An admin may.
    await inviteUser(testDb, admin, { email: "sleeper@example.com", name: "Sleeper", role: "admin" });
    expect(await testDb.select().from(mailOutbox)).toHaveLength(1);
  });

  it("allows a manager to re-invite an inactive member", async () => {
    const { manager, member } = await setup();
    await testDb.update(users).set({ active: false }).where(eq(users.id, member.id));
    await inviteUser(testDb, manager, { email: member.email, name: "Neuer Name", role: "member" });
    expect((await testDb.select().from(users).where(eq(users.id, member.id)))[0]).toMatchObject({ role: "member", name: "Neuer Name" });
  });

  it("lists users for admins and managers only", async () => {
    const { admin, manager, member } = await setup();
    expect((await listUsers(testDb, admin)).length).toBe(6);
    expect((await listUsers(testDb, manager)).length).toBe(6);
    await expect(listUsers(testDb, member)).rejects.toMatchObject(forbidden);
  });
});

describe("manager role: accounts", () => {
  beforeEach(resetDb);

  it("lets a manager deactivate and reactivate members, which also ends their open links", async () => {
    const { manager, member } = await setup();
    await inviteUser(testDb, manager, { email: "wartet@example.com", name: "Wartet", role: "member" });
    const [waiting] = await testDb.select().from(users).where(eq(users.email, "wartet@example.com"));
    expect(await testDb.select().from(authTokens).where(eq(authTokens.userId, waiting.id))).toHaveLength(1);
    await setUserActive(testDb, manager, member.id, false);
    expect(await activeOf(member.id)).toBe(false);
    await setUserActive(testDb, manager, member.id, true);
    expect(await activeOf(member.id)).toBe(true);
    await setUserActive(testDb, manager, waiting.id, false);
    expect(await testDb.select().from(authTokens).where(eq(authTokens.userId, waiting.id))).toEqual([]);
  });

  it("keeps managers' hands off admins and other managers", async () => {
    const { manager, manager2, admin } = await setup();
    for (const target of [admin, manager2]) {
      await expect(setUserActive(testDb, manager, target.id, false)).rejects.toMatchObject(forbidden);
      expect(await activeOf(target.id)).toBe(true);
      await expect(revokeInvitation(testDb, manager, target.id)).rejects.toMatchObject(forbidden);
    }
  });

  it("does not leak existence through the error: unknown and malformed ids are NOT_FOUND", async () => {
    const { manager } = await setup();
    await expect(setUserActive(testDb, manager, "00000000-0000-4000-8000-000000000000", false)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(setUserActive(testDb, manager, "kaputt", false)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(revokeInvitation(testDb, manager, "kaputt")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("stops a manager from deactivating themselves", async () => {
    const { manager } = await setup();
    await expect(setUserActive(testDb, manager, manager.id, false)).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("lets plain members do none of it", async () => {
    const { member, member2, admin } = await setup();
    await expect(setUserActive(testDb, member, member2.id, false)).rejects.toMatchObject(forbidden);
    await expect(setUserActive(testDb, member, admin.id, false)).rejects.toMatchObject(forbidden);
    await expect(revokeInvitation(testDb, member, member2.id)).rejects.toMatchObject(forbidden);
    expect(await activeOf(member2.id)).toBe(true);
    expect(await activeOf(admin.id)).toBe(true);
  });

  it("reserves global roles for admins: no promotion by managers, not even of themselves", async () => {
    const { manager, member, admin, admin2 } = await setup();
    for (const [target, role] of [[member, "admin"], [member, "manager"], [manager, "admin"], [admin, "member"]] as const) {
      await expect(setUserRole(testDb, manager, target.id, role)).rejects.toMatchObject(forbidden);
    }
    await expect(setUserRole(testDb, member, member.id, "admin")).rejects.toMatchObject(forbidden);
    expect(await roleOf(member.id)).toBe("member");
    expect(await roleOf(manager.id)).toBe("manager");
    expect(await roleOf(admin.id)).toBe("admin");

    await setUserRole(testDb, admin, member.id, "manager");
    expect(await roleOf(member.id)).toBe("manager");
    await setUserRole(testDb, admin, admin2.id, "member");
    expect(await roleOf(admin2.id)).toBe("member");
    await expect(setUserRole(testDb, admin, admin.id, "member")).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(setUserRole(testDb, admin, member.id, "root" as GlobalRole)).rejects.toThrow();
  });

  it("takes effect at once: a demoted manager loses the rights on the next request", async () => {
    const { admin, manager, member2 } = await setup();
    await setUserActive(testDb, (await resolveActor(testDb, manager.id))!, member2.id, false);
    await setUserRole(testDb, admin, manager.id, "member");
    const demoted = (await resolveActor(testDb, manager.id))!;
    expect(demoted.role).toBe("member");
    await expect(setUserActive(testDb, demoted, member2.id, true)).rejects.toMatchObject(forbidden);
    await expect(createGroup(testDb, demoted, "Nein")).rejects.toMatchObject(forbidden);
  });
});

describe("manager role: groups", () => {
  beforeEach(resetDb);

  it("lets managers (and admins) run groups completely", async () => {
    const { manager, admin, member } = await setup();
    const { id } = await createGroup(testDb, manager, "Vertrieb");
    await renameGroup(testDb, manager, id, "Verkauf");
    await addGroupMember(testDb, manager, id, member.id);
    expect((await listGroups(testDb, manager))[0]).toMatchObject({ name: "Verkauf", members: [{ id: member.id }] });
    await removeGroupMember(testDb, manager, id, member.id);
    await addGroupMember(testDb, admin, id, member.id);
    await deleteGroup(testDb, manager, id);
    expect(await listGroups(testDb, admin)).toEqual([]);
  });

  it("keeps plain members out of group administration", async () => {
    const { manager, member, member2 } = await setup();
    const { id } = await createGroup(testDb, manager, "Team");
    await addGroupMember(testDb, manager, id, member2.id);
    await expect(listGroups(testDb, member)).rejects.toMatchObject(forbidden);
    await expect(createGroup(testDb, member, "Neu")).rejects.toMatchObject(forbidden);
    await expect(renameGroup(testDb, member, id, "Umbenannt")).rejects.toMatchObject(forbidden);
    await expect(addGroupMember(testDb, member, id, member.id)).rejects.toMatchObject(forbidden);
    await expect(removeGroupMember(testDb, member, id, member2.id)).rejects.toMatchObject(forbidden);
    await expect(deleteGroup(testDb, member, id)).rejects.toMatchObject(forbidden);
    expect((await listGroups(testDb, manager))[0]).toMatchObject({ name: "Team", members: [{ id: member2.id }] });
  });

  it("gives a manager no way into a project through a group: only that project's owners add groups", async () => {
    const { manager, member, member2 } = await setup();
    const { project } = await makeProject(member, "GRX");
    const { id } = await createGroup(testDb, manager, "Eindringlinge");
    await addGroupMember(testDb, manager, id, manager.id);
    await expect(addGroupToProject(testDb, manager, project.id, id, "member")).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(addMemberByEmail(testDb, manager, project.id, manager.email, "owner")).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await getProjectForUser(testDb, manager, project.id)).toBeNull();
    // Even as a plain member of the project the manager cannot add anyone.
    await addMember(project.id, manager, "member");
    await expect(addGroupToProject(testDb, manager, project.id, id, "member")).rejects.toMatchObject(forbidden);
    expect(member2.id).toBeTruthy();
  });
});

describe("manager role: system settings stay with admins", () => {
  beforeEach(resetDb);

  it("keeps backups and server settings away from managers and members", async () => {
    const { admin, manager, member } = await setup();
    for (const actor of [manager, member]) {
      await expect(listBackupRuns(testDb, actor)).rejects.toMatchObject(forbidden);
      await expect(requestBackup(testDb, actor)).rejects.toMatchObject(forbidden);
      await expect(setBaseUrl(testDb, actor, "https://evil.example.com")).rejects.toMatchObject(forbidden);
      await expect(setHttpsOnly(testDb, actor, true, "https")).rejects.toMatchObject(forbidden);
    }
    await expect(listBackupRuns(testDb, admin)).resolves.toEqual([]);
    await expect(setBaseUrl(testDb, admin, "https://pp.example.com")).resolves.toBeUndefined();
  });
});

describe("manager role: no implicit access to projects", () => {
  beforeEach(resetDb);

  it("shows a manager only projects they belong to – everywhere", async () => {
    const { manager, member } = await setup();
    const foreign = await makeProject(member, "FOR");
    const task = await createTask(testDb, member, { projectId: foreign.project.id, title: "Streng geheim" });
    expect(task.id).toBeTruthy();

    expect(await listProjectsForUser(testDb, manager)).toEqual([]);
    expect(await getProjectForUser(testDb, manager, foreign.project.id)).toBeNull();
    expect((await searchEverything(testDb, manager, "geheim")).tasks).toEqual([]);
    expect((await searchEverything(testDb, manager, "Projekt FOR")).projects).toEqual([]);
    expect(await listCalendarTasks(testDb, manager, { from: "2000-01-01", to: "2100-01-01", overdueBefore: "2100-01-01" })).toEqual([]);
    await expect(createTask(testDb, manager, { projectId: foreign.project.id, title: "Eingeschleust" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("limits a manager who joined a project to the project role", async () => {
    const { manager, member } = await setup();
    const { project } = await makeProject(member, "JOI");
    await addMember(project.id, manager, "member");
    await expect(createTask(testDb, manager, { projectId: project.id, title: "Darf ich" })).resolves.toBeTruthy();
    await expect(updateProjectDetails(testDb, manager, project.id, { name: "Umbenannt", description: "" })).rejects.toMatchObject(forbidden);
  });

  it("lets a manager create and own projects like anyone", async () => {
    const { manager } = await setup();
    const { project } = await makeProject(manager, "MGR");
    expect((await getProjectForUser(testDb, manager, project.id))?.role).toBe("owner");
  });
});
