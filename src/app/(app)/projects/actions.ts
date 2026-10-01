"use server";

import { revalidatePath } from "next/cache";
import type { CreateProjectInput } from "@/lib/schemas/project";
import { runAction, type ActionResult } from "@/server/action-result";
import { requireActor } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { createProject } from "@/server/projects/service";

export async function createProjectAction(input: CreateProjectInput): Promise<ActionResult<{ id: string }>> {
  const actor = await requireActor();
  return runAction(async () => {
    const project = await createProject(db(), actor, input);
    revalidatePath("/", "layout");
    return { id: project.id };
  });
}
