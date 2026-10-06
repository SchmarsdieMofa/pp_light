"use server";

import { revalidatePath } from "next/cache";
import type { ProjectRole } from "@/lib/enums";
import type { PhaseInput } from "@/lib/schemas/phase";
import type { CreateProjectInput } from "@/lib/schemas/project";
import type { LabelInput, StatusInput } from "@/lib/schemas/task";
import { runAction, type ActionResult } from "@/server/action-result";
import { requireActor } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { createLabel, deleteLabel } from "@/server/labels/service";
import { addGroupToProject, searchAddableGroups, type GroupSuggestion } from "@/server/groups/service";
import { addMemberByEmail, changeMemberRole, removeMember, searchAddableUsers, type UserSuggestion } from "@/server/members/service";
import { createPhase, deletePhase, movePhase, updatePhase } from "@/server/phases/service";
import { getEnv } from "@/lib/env";
import {
  archiveProject,
  completeProject,
  deleteProject,
  restoreProject,
  updateProjectDetails,
  type CloseProjectInput,
  type ProjectDetailsInput,
} from "@/server/projects/lifecycle";
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

export async function searchUsersAction(projectId: string, query: string, browse = false): Promise<ActionResult<UserSuggestion[]>> {
  const actor = await requireActor();
  return runAction(() => searchAddableUsers(db(), actor, projectId, query, { browse }));
}

export async function searchGroupsAction(projectId: string, query: string, browse = false): Promise<ActionResult<GroupSuggestion[]>> {
  const actor = await requireActor();
  return runAction(() => searchAddableGroups(db(), actor, projectId, query, { browse }));
}

export async function addGroupAction(projectId: string, groupId: string, role: ProjectRole): Promise<ActionResult<{ added: number }>> {
  const actor = await requireActor();
  return runAction(async () => {
    const result = await addGroupToProject(db(), actor, projectId, groupId, role);
    revalidatePath("/", "layout");
    return result;
  });
}

export async function changeMemberRoleAction(projectId: string, userId: string, role: ProjectRole) {
  return mutate((actor) => changeMemberRole(db(), actor, projectId, userId, role));
}

export async function removeMemberAction(projectId: string, userId: string) {
  return mutate((actor) => removeMember(db(), actor, projectId, userId));
}

export async function createPhaseAction(projectId: string, input: PhaseInput) {
  return mutate((actor) => createPhase(db(), actor, projectId, input));
}

export async function updatePhaseAction(phaseId: string, input: PhaseInput) {
  return mutate((actor) => updatePhase(db(), actor, phaseId, input));
}

export async function movePhaseAction(phaseId: string, direction: "left" | "right") {
  return mutate((actor) => movePhase(db(), actor, phaseId, direction));
}

export async function deletePhaseAction(phaseId: string) {
  return mutate((actor) => deletePhase(db(), actor, phaseId));
}

export async function updateProjectDetailsAction(projectId: string, input: ProjectDetailsInput) {
  return mutate((actor) => updateProjectDetails(db(), actor, projectId, input));
}

export async function archiveProjectAction(projectId: string) {
  return mutate((actor) => archiveProject(db(), actor, projectId));
}

export async function completeProjectAction(projectId: string, input: CloseProjectInput) {
  return mutate((actor) => completeProject(db(), actor, projectId, input));
}

export async function restoreProjectAction(projectId: string) {
  return mutate((actor) => restoreProject(db(), actor, projectId));
}

export async function deleteProjectAction(projectId: string, confirmKey: string) {
  return mutate((actor) => deleteProject(db(), actor, projectId, confirmKey, getEnv().UPLOAD_DIR));
}
