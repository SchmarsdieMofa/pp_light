"use server";

import { revalidatePath } from "next/cache";
import { runAction, type ActionResult } from "@/server/action-result";
import { requireActor } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { completeTask } from "@/server/my-work/service";

export async function completeTaskAction(taskId: string): Promise<ActionResult<void>> {
  const actor = await requireActor();
  return runAction(async () => {
    await completeTask(db(), actor, taskId);
    revalidatePath("/", "layout");
  });
}
