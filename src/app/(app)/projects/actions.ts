"use server";

import { revalidatePath } from "next/cache";
import type { ProjectRole } from "@/lib/enums";
import type { CreateProjectInput } from "@/lib/schemas/project";
import type { LabelInput, StatusInput } from "@/lib/schemas/task";
import { runAction, type ActionResult } from "@/server/action-result";
import { requireActor } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { createLabel, deleteLabel } from "@/server/labels/service";
import { addMemberByEmail, changeMemberRole, removeMember } from "@/server/members/service";
import { createProject } from "@/server/projects/service";
import { createStatus, deleteStatus, moveStatus, updateStatus } from "@/server/statuses/service";

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

async function mutate(fn: (actor: Awaited<ReturnType<typeof requireActor>>) => Promise<unknown>): Promise<ActionResult<void>> {
  const actor = await requireActor();
  return runAction(async () => {
    await fn(actor);
    revalidatePath("/", "layout");
  });
}

export async function createStatusAction(projectId: string, input: StatusInput) {
  return mutate((actor) => createStatus(db(), actor, projectId, input));
}

export async function updateStatusAction(statusId: string, input: StatusInput) {
  return mutate((actor) => updateStatus(db(), actor, statusId, input));
}

export async function moveStatusAction(statusId: string, direction: "left" | "right") {
  return mutate((actor) => moveStatus(db(), actor, statusId, direction));
}

export async function deleteStatusAction(statusId: string, targetStatusId: string) {
  return mutate((actor) => deleteStatus(db(), actor, statusId, targetStatusId));
}

export async function addMemberAction(projectId: string, email: string, role: ProjectRole) {
  return mutate((actor) => addMemberByEmail(db(), actor, projectId, email, role));
}

export async function changeMemberRoleAction(projectId: string, userId: string, role: ProjectRole) {
  return mutate((actor) => changeMemberRole(db(), actor, projectId, userId, role));
}

export async function removeMemberAction(projectId: string, userId: string) {
  return mutate((actor) => removeMember(db(), actor, projectId, userId));
}
