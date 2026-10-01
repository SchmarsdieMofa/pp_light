import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { projects, statuses, users } from "@/server/db/schema";
import { byPosition } from "@/server/db/order";
import { resetDb, testDb } from "../helpers/db";

describe("database schema", () => {
  beforeEach(resetDb);

  it("stores a user with defaults", async () => {
    const [user] = await testDb
      .insert(users)
      .values({ email: "a@example.com", name: "A" })
      .returning();
    expect(user.role).toBe("member");
    expect(user.active).toBe(true);
    expect(user.passwordHash).toBeNull();
  });

  it("rejects duplicate project keys", async () => {
    const [user] = await testDb.insert(users).values({ email: "a@example.com", name: "A" }).returning();
    await testDb.insert(projects).values({ name: "X", key: "ABC", createdBy: user.id });
    await expect(
      testDb.insert(projects).values({ name: "Y", key: "ABC", createdBy: user.id }),
    ).rejects.toThrow();
  });

  it("orders positions bytewise regardless of database collation", async () => {
    const [user] = await testDb.insert(users).values({ email: "a@example.com", name: "A" }).returning();
    const [project] = await testDb
      .insert(projects)
      .values({ name: "X", key: "ABC", createdBy: user.id })
      .returning();
    await testDb.insert(statuses).values([
      { projectId: project.id, name: "lower", color: "#000", position: "a0" },
      { projectId: project.id, name: "upper", color: "#000", position: "Zz" },
    ]);
    // Force a locale-aware collation (as on Debian/ICU hosts) so the test proves byPosition overrides it.
    await testDb.execute(sql`alter table statuses alter column position type text collate "en-US-x-icu"`);
    try {
      const naive = await testDb.select().from(statuses).orderBy(statuses.position);
      expect(naive.map((r) => r.name)).toEqual(["lower", "upper"]);
      const rows = await testDb.select().from(statuses).orderBy(byPosition(statuses.position));
      expect(rows.map((r) => r.name)).toEqual(["upper", "lower"]);
    } finally {
      await testDb.execute(sql`alter table statuses alter column position type text collate "default"`);
    }
  });
});
