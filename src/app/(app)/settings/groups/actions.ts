"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/server/action-result";
import { requireActor } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { addGroupMember, createGroup, deleteGroup, removeGroupMember, renameGroup } from "@/server/groups/service";

function mutate(fn: (actor: Awaited<ReturnType<typeof requireActor>>) => Promise<unknown>) {
  return requireActor().then((actor) =>
    runAction(async () => {
      await fn(actor);
      revalidatePath("/", "layout");
    }),
  );
}

export async function createGroupAction(name: string) {
  const actor = await requireActor();
  return runAction(async () => {
    const group = await createGroup(db(), actor, name);
    revalidatePath("/", "layout");
    return group;
  });
}

export async function renameGroupAction(groupId: string, name: string) {
  return mutate((actor) => renameGroup(db(), actor, groupId, name));
}

export async function deleteGroupAction(groupId: string) {
  return mutate((actor) => deleteGroup(db(), actor, groupId));
}

export async function addGroupMemberAction(groupId: string, userId: string) {
  return mutate((actor) => addGroupMember(db(), actor, groupId, userId));
}

export async function removeGroupMemberAction(groupId: string, userId: string) {
  return mutate((actor) => removeGroupMember(db(), actor, groupId, userId));
}
