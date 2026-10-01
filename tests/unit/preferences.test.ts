import { beforeEach, describe, expect, it } from "vitest";
import { ZodError } from "zod";
import type { CardDensity, Theme } from "@/lib/enums";
import { DEFAULT_PREFERENCES, getPreferences, setCardDensity, setTheme } from "@/server/preferences/service";
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

  it("stores the card density independently of the theme", async () => {
    const user = await createUser(testDb, { email: "ada@example.com", name: "Ada" });
    await setTheme(testDb, user.id, "dark");
    await setCardDensity(testDb, user.id, "compact");
    expect(await getPreferences(testDb, user.id)).toEqual({ theme: "dark", cardDensity: "compact" });
    await expect(setCardDensity(testDb, user.id, "huge" as CardDensity)).rejects.toBeInstanceOf(ZodError);
  });

  it("rejects unknown themes", async () => {
    const user = await createUser(testDb, { email: "ada@example.com", name: "Ada" });
    await expect(setTheme(testDb, user.id, "pink" as Theme)).rejects.toBeInstanceOf(ZodError);
  });
});
