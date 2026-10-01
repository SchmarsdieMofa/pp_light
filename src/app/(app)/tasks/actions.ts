"use server";

import { revalidatePath } from "next/cache";
import type { CreateTaskInput, MoveTaskInput, TaskPatch } from "@/lib/schemas/task";
import { runAction, type ActionResult } from "@/server/action-result";
import { requireActor } from "@/server/auth/session";
import { addChecklistItem, deleteChecklistItem, setChecklistItemDone } from "@/server/checklists/service";
import { db } from "@/server/db/client";
import { undoScheduleGroup } from "@/server/dependencies/undo";
import { setTaskAssignees, setTaskLabels } from "@/server/tasks/relations";
import { createTask, moveTask, updateTask } from "@/server/tasks/service";

/** Every task mutation re-renders board, list, panel and task page in the same round trip. */
function refresh() {
  revalidatePath("/", "layout");
}

export async function createTaskAction(input: CreateTaskInput): Promise<ActionResult<{ id: string; number: number }>> {
  const actor = await requireActor();
  return runAction(async () => {
    const task = await createTask(db(), actor, input);
    refresh();
    return { id: task.id, number: task.number };
  });
}

export async function updateTaskAction(
  taskId: string,
  expectedUpdatedAt: string,
  patch: TaskPatch,
): Promise<ActionResult<{ updatedAt: string; movedCount: number; groupId: string | null }>> {
  const actor = await requireActor();
  return runAction(async () => {
    const task = await updateTask(db(), actor, taskId, expectedUpdatedAt, patch);
    refresh();
    return {
      updatedAt: task.updatedAt.toISOString(),
      movedCount: task.schedule?.movedCount ?? 0,
      groupId: task.schedule?.groupId ?? null,
    };
  });
}

export async function setAssigneesAction(taskId: string, userIds: string[]): Promise<ActionResult<void>> {
  const actor = await requireActor();
  return runAction(async () => {
    await setTaskAssignees(db(), actor, taskId, userIds);
    refresh();
  });
}

export async function setLabelsAction(taskId: string, labelIds: string[]): Promise<ActionResult<void>> {
  const actor = await requireActor();
  return runAction(async () => {
    await setTaskLabels(db(), actor, taskId, labelIds);
    refresh();
  });
}

export async function addChecklistItemAction(taskId: string, text: string): Promise<ActionResult<void>> {
  const actor = await requireActor();
  return runAction(async () => {
    await addChecklistItem(db(), actor, taskId, text);
    refresh();
  });
}

export async function toggleChecklistItemAction(itemId: string, done: boolean): Promise<ActionResult<void>> {
  const actor = await requireActor();
  return runAction(async () => {
    await setChecklistItemDone(db(), actor, itemId, done);
    refresh();
  });
}

export async function deleteChecklistItemAction(itemId: string): Promise<ActionResult<void>> {
  const actor = await requireActor();
  return runAction(async () => {
    await deleteChecklistItem(db(), actor, itemId);
    refresh();
  });
}

export async function moveTaskAction(taskId: string, input: MoveTaskInput): Promise<ActionResult<void>> {
  const actor = await requireActor();
  return runAction(async () => {
    await moveTask(db(), actor, taskId, input);
    refresh();
  });
}

export async function undoScheduleAction(groupId: string): Promise<ActionResult<void>> {
  const actor = await requireActor();
  return runAction(async () => {
    await undoScheduleGroup(db(), actor, groupId);
    refresh();
  });
}
