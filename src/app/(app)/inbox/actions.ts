"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/server/action-result";
import { requireActor } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { markAllNotificationsRead, markNotificationRead, setNotificationPreferences } from "@/server/notifications/service";

export async function markReadAction(id: string) {
  const actor = await requireActor();
  return runAction(async () => {
    await markNotificationRead(db(), actor, id);
    revalidatePath("/inbox");
  });
}

export async function markAllReadAction() {
  const actor = await requireActor();
  return runAction(async () => {
    await markAllNotificationsRead(db(), actor);
    revalidatePath("/inbox");
  });
}

export async function saveNotificationPreferencesAction(disabled: string[]) {
  const actor = await requireActor();
  return runAction(async () => {
    await setNotificationPreferences(db(), actor.id, disabled);
    // The settings tab lives in the app layout, which every page renders.
    revalidatePath("/", "layout");
  });
}
