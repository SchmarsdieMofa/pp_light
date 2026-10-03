import { eq } from "drizzle-orm";
import { z } from "zod";
import { CARD_DENSITIES, THEMES, type CardDensity, type Theme } from "@/lib/enums";
import type { DB } from "@/server/db/client";
import { userPreferences } from "@/server/db/schema";

export type Preferences = { theme: Theme; cardDensity: CardDensity; onboarded: boolean };

export const DEFAULT_PREFERENCES: Preferences = { theme: "system", cardDensity: "medium", onboarded: false };

export async function getPreferences(db: DB, userId: string): Promise<Preferences> {
  const [row] = await db.select().from(userPreferences).where(eq(userPreferences.userId, userId)).limit(1);
  return row ? { theme: row.theme, cardDensity: row.cardDensity, onboarded: row.onboardedAt !== null } : DEFAULT_PREFERENCES;
}

export async function setTheme(db: DB, userId: string, theme: Theme): Promise<void> {
  const value = z.enum(THEMES).parse(theme);
  await db
    .insert(userPreferences)
    .values({ userId, theme: value })
    .onConflictDoUpdate({ target: userPreferences.userId, set: { theme: value } });
}

export async function setCardDensity(db: DB, userId: string, density: CardDensity): Promise<void> {
  const value = z.enum(CARD_DENSITIES).parse(density);
  await db
    .insert(userPreferences)
    .values({ userId, cardDensity: value })
    .onConflictDoUpdate({ target: userPreferences.userId, set: { cardDensity: value } });
}

/** The welcome tour was finished or skipped – it does not open by itself again. */
export async function markOnboarded(db: DB, userId: string): Promise<void> {
  const now = new Date();
  await db
    .insert(userPreferences)
    .values({ userId, onboardedAt: now })
    .onConflictDoUpdate({ target: userPreferences.userId, set: { onboardedAt: now } });
}
