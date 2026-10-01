import { beforeEach, describe, expect, it } from "vitest";
import { ZodError } from "zod";
import type { Theme } from "@/lib/enums";
import { DEFAULT_PREFERENCES, getPreferences, setTheme } from "@/server/preferences/service";
import { createUser } from "@/server/users/service";
import { resetDb, testDb } from "../helpers/db";

describe("preferences service", () => {
  beforeEach(resetDb);

  it("returns defaults when nothing is stored", async () => {
    const user = await createUser(testDb, { email: "ada@example.com", name: "Ada" });
    expect(await getPreferences(testDb, user.id)).toEqual(DEFAULT_PREFERENCES);
  });

  it("stores and overwrites the theme", async () => {
    const user = await createUser(testDb, { email: "ada@example.com", name: "Ada" });
    await setTheme(testDb, user.id, "dark");
    await setTheme(testDb, user.id, "light");
    expect(await getPreferences(testDb, user.id)).toEqual({ theme: "light", cardDensity: "medium" });
  });

  it("rejects unknown themes", async () => {
    const user = await createUser(testDb, { email: "ada@example.com", name: "Ada" });
    await expect(setTheme(testDb, user.id, "pink" as Theme)).rejects.toBeInstanceOf(ZodError);
  });
});
