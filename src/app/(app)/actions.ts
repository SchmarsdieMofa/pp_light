"use server";

import { revalidatePath } from "next/cache";
import { signOut } from "@/auth";
import type { CardDensity, Theme } from "@/lib/enums";
import { runAction, type ActionResult } from "@/server/action-result";
import { requireActor } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { setCardDensity, setTheme } from "@/server/preferences/service";

export async function logoutAction(): Promise<void> {
  await signOut({ redirectTo: "/login" });
}

export async function saveThemeAction(theme: Theme): Promise<ActionResult<void>> {
  const actor = await requireActor();
  return runAction(() => setTheme(db(), actor.id, theme));
}

export async function saveCardDensityAction(density: CardDensity): Promise<ActionResult<void>> {
  const actor = await requireActor();
  return runAction(async () => {
    await setCardDensity(db(), actor.id, density);
    revalidatePath("/", "layout");
  });
}
