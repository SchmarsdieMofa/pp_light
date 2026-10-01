import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { resolveActor } from "@/server/auth/actor";
import { users } from "@/server/db/schema";
import { createUser } from "@/server/users/service";
import { resetDb, testDb } from "../helpers/db";

describe("resolveActor", () => {
  beforeEach(resetDb);

  it("returns null without a user id", async () => {
    expect(await resolveActor(testDb, undefined)).toBeNull();
    expect(await resolveActor(testDb, null)).toBeNull();
  });

  it("returns null for a malformed id instead of throwing", async () => {
    expect(await resolveActor(testDb, "not-a-uuid")).toBeNull();
  });

  it("maps an active user to an actor", async () => {
    const user = await createUser(testDb, { email: "ada@example.com", name: "Ada", role: "admin" });
    expect(await resolveActor(testDb, user.id)).toEqual({
      id: user.id,
      role: "admin",
      name: "Ada",
      email: "ada@example.com",
    });
  });

  it("returns null once the user is deactivated (session still valid)", async () => {
    const user = await createUser(testDb, { email: "ada@example.com", name: "Ada" });
    await testDb.update(users).set({ active: false }).where(eq(users.id, user.id));
    expect(await resolveActor(testDb, user.id)).toBeNull();
  });
});
