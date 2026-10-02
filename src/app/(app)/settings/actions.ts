"use server";

import { revalidatePath } from "next/cache";
import { runAction, type ActionResult } from "@/server/action-result";
import { requireActor } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { changeOwnPassword, updateOwnName } from "@/server/users/account";

export async function updateOwnNameAction(name: string): Promise<ActionResult<void>> {
  const actor = await requireActor();
  return runAction(async () => {
    await updateOwnName(db(), actor, name);
    revalidatePath("/", "layout");
  });
}

/** On success every session ends; the client then signs out. */
export async function changeOwnPasswordAction(current: string, next: string): Promise<ActionResult<void>> {
  const actor = await requireActor();
  return runAction(() => changeOwnPassword(db(), actor, current, next));
}
