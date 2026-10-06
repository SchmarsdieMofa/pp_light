import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { users } from "@/server/db/schema";
import { addGroupMember, createGroup, deleteGroup, listGroups, removeGroupMember, renameGroup } from "@/server/groups/service";
import { resetDb, testDb } from "../helpers/db";
import { makeActor } from "../helpers/fixtures";

async function setup() {
  const root = await makeActor("root@example.com", "admin");
  const ada = await makeActor("ada@example.com");
  const mia = await makeActor("mia@example.com");
  const gus = await makeActor("gus@example.com");
  const off = await makeActor("off@example.com");
  await testDb.update(users).set({ active: false }).where(eq(users.id, off.id));
  const { id: groupId } = await createGroup(testDb, root, "Marketing");
  for (const person of [ada, mia, gus, off]) await addGroupMember(testDb, root, groupId, person.id);
  return { root, ada, mia, gus, off, groupId };
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
});
