import { beforeEach, describe, expect, it } from "vitest";
import { ZodError } from "zod";
import type { Actor } from "@/server/permissions";
import {
  createProject,
  getProjectForUser,
  listProjectsForUser,
  listStatuses,
} from "@/server/projects/service";
import { createUser } from "@/server/users/service";
import { resetDb, testDb } from "../helpers/db";

async function actor(email: string, role: "admin" | "member" = "member"): Promise<Actor> {
  const u = await createUser(testDb, { email, name: email.split("@")[0], role });
  return { id: u.id, role: u.role, name: u.name, email: u.email };
}

describe("projects service", () => {
  beforeEach(resetDb);

  it("creates a project with normalized key, owner membership and default statuses", async () => {
    const ada = await actor("ada@example.com");
    const project = await createProject(testDb, ada, { name: "  Website-Relaunch ", key: " web " });
    expect(project.key).toBe("WEB");
    expect(project.name).toBe("Website-Relaunch");

    const access = await getProjectForUser(testDb, ada, project.id);
    expect(access?.role).toBe("owner");

    const statuses = await listStatuses(testDb, project.id);
    expect(statuses.map((s) => [s.name, s.isDone])).toEqual([
      ["Offen", false],
      ["In Arbeit", false],
      ["Review", false],
      ["Fertig", true],
    ]);
  });

  it("rejects invalid keys with a validation error", async () => {
    const ada = await actor("ada@example.com");
    await expect(createProject(testDb, ada, { name: "X", key: "1AB" })).rejects.toBeInstanceOf(ZodError);
    await expect(createProject(testDb, ada, { name: "X", key: "A" })).rejects.toBeInstanceOf(ZodError);
    await expect(createProject(testDb, ada, { name: "", key: "ABC" })).rejects.toBeInstanceOf(ZodError);
  });

  it("reports a duplicate key as KEY_TAKEN, also when created concurrently", async () => {
    const ada = await actor("ada@example.com");
    await createProject(testDb, ada, { name: "A", key: "DUP" });
    await expect(createProject(testDb, ada, { name: "B", key: "dup" })).rejects.toMatchObject({
      code: "KEY_TAKEN",
    });

    const results = await Promise.allSettled([
      createProject(testDb, ada, { name: "C", key: "RACE" }),
      createProject(testDb, ada, { name: "D", key: "RACE" }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ code: "KEY_TAKEN" });
  });

  it("lists only projects the user is a member of; admins see all", async () => {
    const ada = await actor("ada@example.com");
    const bob = await actor("bob@example.com");
    const root = await actor("root@example.com", "admin");
    await createProject(testDb, ada, { name: "Beta", key: "BET" });
    await createProject(testDb, ada, { name: "Alpha", key: "ALP" });
    await createProject(testDb, bob, { name: "Bobs", key: "BOB" });

    expect((await listProjectsForUser(testDb, ada)).map((p) => p.name)).toEqual(["Alpha", "Beta"]);
    expect((await listProjectsForUser(testDb, bob)).map((p) => p.name)).toEqual(["Bobs"]);
    expect((await listProjectsForUser(testDb, root)).map((p) => p.name)).toEqual(["Alpha", "Beta", "Bobs"]);
  });

  it("hides projects from non-members and tolerates malformed ids", async () => {
    const ada = await actor("ada@example.com");
    const bob = await actor("bob@example.com");
    const root = await actor("root@example.com", "admin");
    const project = await createProject(testDb, ada, { name: "Geheim", key: "SEC" });

    expect(await getProjectForUser(testDb, bob, project.id)).toBeNull();
    expect(await getProjectForUser(testDb, ada, "abc")).toBeNull();
    expect(await getProjectForUser(testDb, ada, "00000000-0000-4000-8000-000000000000")).toBeNull();
    expect((await getProjectForUser(testDb, root, project.id))?.role).toBe("admin");
  });
});
