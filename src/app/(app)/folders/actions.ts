"use server";

import { revalidatePath } from "next/cache";
import type { ProjectRole } from "@/lib/enums";
import { runAction, type ActionResult } from "@/server/action-result";
import { requireActor } from "@/server/auth/session";
import { db } from "@/server/db/client";
import {
  addFolderGroup,
  addFolderMemberByEmail,
  changeFolderGroupRole,
  changeFolderMemberRole,
  createFolder,
  deleteFolder,
  getFolderDetail,
  moveProjectToFolder,
  removeFolderGroup,
  removeFolderMember,
  renameFolder,
  searchFolderGroups,
  searchFolderUsers,
  type FolderDetail,
  type FolderGroupSuggestion,
  type FolderUserSuggestion,
} from "@/server/folders/service";

/** Folders show in the sidebar, the overview and project headers: refresh them all. */
function refresh() {
  revalidatePath("/", "layout");
}

async function mutate(fn: (actor: Awaited<ReturnType<typeof requireActor>>) => Promise<unknown>): Promise<ActionResult<void>> {
  const actor = await requireActor();
  return runAction(async () => {
    await fn(actor);
    refresh();
  });
}

export async function createFolderAction(name: string): Promise<ActionResult<{ id: string }>> {
  const actor = await requireActor();
  return runAction(async () => {
    const folder = await createFolder(db(), actor, name);
    refresh();
    return folder;
  });
}

export async function getFolderDetailAction(folderId: string): Promise<ActionResult<FolderDetail>> {
  const actor = await requireActor();
  return runAction(() => getFolderDetail(db(), actor, folderId));
}

export async function renameFolderAction(folderId: string, name: string) {
  return mutate((actor) => renameFolder(db(), actor, folderId, name));
}

export async function deleteFolderAction(folderId: string) {
  return mutate((actor) => deleteFolder(db(), actor, folderId));
}

export async function searchFolderUsersAction(folderId: string, query: string, browse = false): Promise<ActionResult<FolderUserSuggestion[]>> {
  const actor = await requireActor();
  return runAction(() => searchFolderUsers(db(), actor, folderId, query, { browse }));
}

export async function searchFolderGroupsAction(folderId: string, query: string, browse = false): Promise<ActionResult<FolderGroupSuggestion[]>> {
  const actor = await requireActor();
  return runAction(() => searchFolderGroups(db(), actor, folderId, query, { browse }));
}

export async function addFolderMemberAction(folderId: string, email: string, role: ProjectRole) {
  return mutate((actor) => addFolderMemberByEmail(db(), actor, folderId, email, role));
}

export async function changeFolderMemberRoleAction(folderId: string, userId: string, role: ProjectRole) {
  return mutate((actor) => changeFolderMemberRole(db(), actor, folderId, userId, role));
}

export async function removeFolderMemberAction(folderId: string, userId: string) {
  return mutate((actor) => removeFolderMember(db(), actor, folderId, userId));
}

export async function addFolderGroupAction(folderId: string, groupId: string, role: ProjectRole): Promise<ActionResult<{ size: number }>> {
  const actor = await requireActor();
  return runAction(async () => {
    const result = await addFolderGroup(db(), actor, folderId, groupId, role);
    refresh();
    return result;
  });
}

export async function changeFolderGroupRoleAction(folderId: string, groupId: string, role: ProjectRole) {
  return mutate((actor) => changeFolderGroupRole(db(), actor, folderId, groupId, role));
}

export async function removeFolderGroupAction(folderId: string, groupId: string) {
  return mutate((actor) => removeFolderGroup(db(), actor, folderId, groupId));
}

export async function moveProjectToFolderAction(projectId: string, folderId: string | null) {
  return mutate((actor) => moveProjectToFolder(db(), actor, projectId, folderId));
}
