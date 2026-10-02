import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { users } from "@/server/db/schema";
import { changeOwnPassword, hasPassword, setUserRole, updateOwnName } from "@/server/users/account";
import { createUser, verifyCredentials } from "@/server/users/service";
import { resetDb, testDb } from "../helpers/db";
import { makeActor } from "../helpers/fixtures";

const PW = "altes-passwort-1";
const NEW = "neues-passwort-2";

async function withPassword() {
  const u = await createUser(testDb, { email: "ada@example.com", name: "Ada", password: PW });
  return { actor: { id: u.id, role: u.role, name: u.name, email: u.email }, user: u };
}

describe("own account", () => {
  beforeEach(resetDb);

  it("renames yourself and rejects an empty name", async () => {
    const { actor } = await withPassword();
    await updateOwnName(testDb, actor, "  Ada L. ");
    const [row] = await testDb.select().from(users).where(eq(users.id, actor.id));
    expect(row.name).toBe("Ada L.");
    await expect(updateOwnName(testDb, actor, "  ")).rejects.toThrow();
  });

  it("changes the password only with the current one and ends all sessions", async () => {
    const { actor, user } = await withPassword();
    expect(await hasPassword(testDb, actor)).toBe(true);
    await expect(changeOwnPassword(testDb, actor, "falsch-falsch-1", NEW)).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(changeOwnPassword(testDb, actor, PW, "kurz")).rejects.toMatchObject({ code: "VALIDATION" });
    await changeOwnPassword(testDb, actor, PW, NEW);
    expect(await verifyCredentials(testDb, "ada@example.com", PW)).toBeNull();
    expect((await verifyCredentials(testDb, "ada@example.com", NEW))?.sessionVersion).toBe(user.sessionVersion + 1);
  });

  it("locks after repeated wrong current passwords", async () => {
    const { actor } = await withPassword();
    for (let i = 0; i < 5; i++) {
      await expect(changeOwnPassword(testDb, actor, "falsch-falsch-1", NEW)).rejects.toMatchObject({ code: "VALIDATION" });
    }
    await expect(changeOwnPassword(testDb, actor, PW, NEW)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("refuses a password change for SSO-only accounts", async () => {
    const sso = await makeActor("sso@example.com");
    expect(await hasPassword(testDb, sso)).toBe(false);
    await expect(changeOwnPassword(testDb, sso, "irgendwas-123", NEW)).rejects.toMatchObject({ code: "VALIDATION" });
  });
});

describe("user roles", () => {
  beforeEach(resetDb);

  it("lets admins change other people's role, not their own", async () => {
    const root = await makeActor("root@example.com", "admin");
    const mia = await makeActor("mia@example.com");
    await setUserRole(testDb, root, mia.id, "admin");
    const [row] = await testDb.select().from(users).where(eq(users.id, mia.id));
    expect(row.role).toBe("admin");
    await expect(setUserRole(testDb, root, root.id, "member")).rejects.toMatchObject({ code: "VALIDATION" });
    // A second admin may demote the first one.
    await setUserRole(testDb, { ...mia, role: "admin" }, root.id, "member");
    const ole = await makeActor("ole@example.com");
    await expect(setUserRole(testDb, ole, mia.id, "member")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
