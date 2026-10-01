"use server";

import { revalidatePath } from "next/cache";
import type { CreateProjectInput } from "@/lib/schemas/project";
import type { LabelInput } from "@/lib/schemas/task";
import { runAction, type ActionResult } from "@/server/action-result";
import { requireActor } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { createLabel, deleteLabel } from "@/server/labels/service";
import { createProject } from "@/server/projects/service";

export async function createProjectAction(input: CreateProjectInput): Promise<ActionResult<{ id: string }>> {
  const actor = await requireActor();
  return runAction(async () => {
    const project = await createProject(db(), actor, input);
    revalidatePath("/", "layout");
    return { id: project.id };
  });
}

export async function createLabelAction(input: LabelInput): Promise<ActionResult<void>> {
  const actor = await requireActor();
  return runAction(async () => {
    await createLabel(db(), actor, input);
    revalidatePath("/", "layout");
  });
}

export async function deleteLabelAction(labelId: string): Promise<ActionResult<void>> {
  const actor = await requireActor();
  return runAction(async () => {
    await deleteLabel(db(), actor, labelId);
    revalidatePath("/", "layout");
  });
}
