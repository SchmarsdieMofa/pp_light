import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { users } from "@/server/db/schema";
import { addMemberByEmail, changeMemberRole, removeMember, searchAddableUsers } from "@/server/members/service";
import { listMembers } from "@/server/projects/service";
import { getTaskDetail } from "@/server/tasks/queries";
import { setTaskAssignees } from "@/server/tasks/relations";
import { createTask } from "@/server/tasks/service";
import { resetDb, testDb } from "../helpers/db";
import { makeActor, makeProject } from "../helpers/fixtures";

describe("members", () => {
  beforeEach(resetDb);

  it("adds existing users by email, changes roles and removes them", async () => {
    const ada = await makeActor("ada@example.com");
    const mia = await makeActor("mia@example.com");
    const { project } = await makeProject(ada, "MEM");
    await addMemberByEmail(testDb, ada, project.id, "  MIA@example.com ", "member");
    expect((await listMembers(testDb, project.id)).map((m) => [m.name, m.role])).toEqual([
      ["ada", "owner"],
      ["mia", "member"],
    ]);
    await changeMemberRole(testDb, ada, project.id, mia.id, "guest");
    expect((await listMembers(testDb, project.id)).find((m) => m.id === mia.id)?.role).toBe("guest");
    await removeMember(testDb, ada, project.id, mia.id);
    expect((await listMembers(testDb, project.id)).map((m) => m.name)).toEqual(["ada"]);
  });

  it("explains unknown, inactive and duplicate members", async () => {
    const ada = await makeActor("ada@example.com");
    const off = await makeActor("off@example.com");
    await testDb.update(users).set({ active: false }).where(eq(users.id, off.id));
    const { project } = await makeProject(ada, "ERR");
    await expect(addMemberByEmail(testDb, ada, project.id, "nobody@example.com", "member")).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(addMemberByEmail(testDb, ada, project.id, "off@example.com", "member")).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(addMemberByEmail(testDb, ada, project.id, "ada@example.com", "member")).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("keeps at least one owner", async () => {
    const ada = await makeActor("ada@example.com");
    const mia = await makeActor("mia@example.com");
    const { project } = await makeProject(ada, "OWN");
    await expect(changeMemberRole(testDb, ada, project.id, ada.id, "member")).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(removeMember(testDb, ada, project.id, ada.id)).rejects.toMatchObject({ code: "VALIDATION" });
    await addMemberByEmail(testDb, ada, project.id, "mia@example.com", "owner");
    await changeMemberRole(testDb, ada, project.id, ada.id, "member");
    expect((await listMembers(testDb, project.id)).find((m) => m.id === mia.id)?.role).toBe("owner");
  });

  it("drops the removed member's assignments in that project", async () => {
    const ada = await makeActor("ada@example.com");
    const mia = await makeActor("mia@example.com");
    const { project } = await makeProject(ada, "ASG");
    await addMemberByEmail(testDb, ada, project.id, "mia@example.com", "member");
    const task = await createTask(testDb, ada, { projectId: project.id, title: "T" });
    await setTaskAssignees(testDb, ada, task.id, [ada.id, mia.id]);
    await removeMember(testDb, ada, project.id, mia.id);
    expect((await getTaskDetail(testDb, ada, task.id))?.assigneeIds).toEqual([ada.id]);
  });

  it("suggests only matching, active people who are not members yet", async () => {
    const ada = await makeActor("ada@example.com");
    const mia = await makeActor("mia@example.com");
    const gus = await makeActor("gus@example.com");
    const off = await makeActor("miro@example.com");
    await testDb.update(users).set({ active: false }).where(eq(users.id, off.id));
    const { project } = await makeProject(ada, "SUG");
    await addMemberByEmail(testDb, ada, project.id, "gus@example.com", "member");
    expect(await searchAddableUsers(testDb, ada, project.id, "")).toEqual([]);
    expect((await searchAddableUsers(testDb, ada, project.id, "mi")).map((u) => u.email)).toEqual(["mia@example.com"]);
    expect(await searchAddableUsers(testDb, ada, project.id, "gus")).toEqual([]);
    expect((await searchAddableUsers(testDb, ada, project.id, "", { browse: true })).map((u) => u.email)).toEqual(["mia@example.com"]);
    expect(await searchAddableUsers(testDb, ada, project.id, "%")).toEqual([]);
    await expect(searchAddableUsers(testDb, gus, project.id, "mi")).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mia.id).toBeTruthy();
  });

  it("allows only owners/admins and validates input", async () => {
    const ada = await makeActor("ada@example.com");
    const mia = await makeActor("mia@example.com");
    const root = await makeActor("root@example.com", "admin");
    const { project } = await makeProject(ada, "PER");
    await addMemberByEmail(testDb, ada, project.id, "mia@example.com", "member");
    await expect(addMemberByEmail(testDb, mia, project.id, "root@example.com", "member")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(addMemberByEmail(testDb, root, project.id, "root@example.com", "guest")).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(changeMemberRole(testDb, ada, project.id, "kaputt", "member")).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(changeMemberRole(testDb, ada, project.id, mia.id, "boss" as "member")).rejects.toMatchObject({ code: "VALIDATION" });
  });
});
