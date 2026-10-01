"use server";

import { signOut } from "@/auth";
import type { Theme } from "@/lib/enums";
import { runAction, type ActionResult } from "@/server/action-result";
import { requireActor } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { setTheme } from "@/server/preferences/service";

export async function logoutAction(): Promise<void> {
  await signOut({ redirectTo: "/login" });
}

export async function saveThemeAction(theme: Theme): Promise<ActionResult<void>> {
  const actor = await requireActor();
  return runAction(() => setTheme(db(), actor.id, theme));
}
