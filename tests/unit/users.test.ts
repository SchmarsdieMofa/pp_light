import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { users } from "@/server/db/schema";
import { createUser, findActiveUser, verifyCredentials } from "@/server/users/service";
import { resetDb, testDb } from "../helpers/db";

const PW = "geheim-passwort-1";

describe("users service", () => {
  beforeEach(resetDb);

  it("stores an argon2id hash, never the plaintext", async () => {
    const user = await createUser(testDb, { email: "ada@example.com", name: "Ada", password: PW });
    expect(user.passwordHash).toMatch(/^\$argon2id\$/);
    expect(user.passwordHash).not.toContain(PW);
  });

  it("normalizes email on create and on login", async () => {
    await createUser(testDb, { email: "  Ada@Example.COM ", name: "Ada", password: PW });
    const user = await verifyCredentials(testDb, "ADA@example.com ", PW);
    expect(user?.email).toBe("ada@example.com");
  });

  it("rejects a wrong password", async () => {
    await createUser(testDb, { email: "ada@example.com", name: "Ada", password: PW });
    expect(await verifyCredentials(testDb, "ada@example.com", "falsch-falsch-1")).toBeNull();
  });

  it("rejects an unknown email", async () => {
    expect(await verifyCredentials(testDb, "nobody@example.com", PW)).toBeNull();
  });

  it("rejects users without password (e.g. SSO-only)", async () => {
    await createUser(testDb, { email: "sso@example.com", name: "Sso" });
    expect(await verifyCredentials(testDb, "sso@example.com", PW)).toBeNull();
  });

  it("rejects deactivated users", async () => {
    const user = await createUser(testDb, { email: "ada@example.com", name: "Ada", password: PW });
    await testDb.update(users).set({ active: false }).where(eq(users.id, user.id));
    expect(await verifyCredentials(testDb, "ada@example.com", PW)).toBeNull();
    expect(await findActiveUser(testDb, user.id)).toBeNull();
  });

  it("reports a duplicate email as EMAIL_TAKEN", async () => {
    await createUser(testDb, { email: "ada@example.com", name: "Ada", password: PW });
    await expect(
      createUser(testDb, { email: "ADA@example.com", name: "Ada 2", password: PW }),
    ).rejects.toMatchObject({ code: "EMAIL_TAKEN" });
  });

  it("creates admins on request", async () => {
    const user = await createUser(testDb, { email: "root@example.com", name: "Root", password: PW, role: "admin" });
    expect(user.role).toBe("admin");
  });
});
