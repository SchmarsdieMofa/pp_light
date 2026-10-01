import { eq } from "drizzle-orm";
import { z } from "zod";
import { THEMES, type CardDensity, type Theme } from "@/lib/enums";
import type { DB } from "@/server/db/client";
import { userPreferences } from "@/server/db/schema";

export type Preferences = { theme: Theme; cardDensity: CardDensity };

export const DEFAULT_PREFERENCES: Preferences = { theme: "system", cardDensity: "medium" };

export async function getPreferences(db: DB, userId: string): Promise<Preferences> {
  const [row] = await db.select().from(userPreferences).where(eq(userPreferences.userId, userId)).limit(1);
  return row ? { theme: row.theme, cardDensity: row.cardDensity } : DEFAULT_PREFERENCES;
}

export async function setTheme(db: DB, userId: string, theme: Theme): Promise<void> {
  const value = z.enum(THEMES).parse(theme);
  await db
    .insert(userPreferences)
    .values({ userId, theme: value })
    .onConflictDoUpdate({ target: userPreferences.userId, set: { theme: value } });
}
