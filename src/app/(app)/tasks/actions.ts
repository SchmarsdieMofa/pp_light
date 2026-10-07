"use server";

import { revalidatePath } from "next/cache";
import type { CreateTaskInput, MoveTaskInput, TaskPatch } from "@/lib/schemas/task";
import { runAction, type ActionResult } from "@/server/action-result";
import { requireActor } from "@/server/auth/session";
import { addChecklistItem, deleteChecklistItem, reorderChecklist, setChecklistItemDone, setChecklistItemText } from "@/server/checklists/service";
import { deleteAttachment } from "@/server/attachments/service";
import { createComment, deleteComment, updateComment } from "@/server/comments/service";
import { db } from "@/server/db/client";
import { getEnv } from "@/lib/env";
import { addDependency, previewDependency, removeDependency, updateDependencyLag, type DependencyPreviewMove } from "@/server/dependencies/service";
import { undoScheduleGroup } from "@/server/dependencies/undo";
import { setTaskAssignees, setTaskLabels } from "@/server/tasks/relations";
import { createTask, moveTask, updateTask } from "@/server/tasks/service";

/** Every task mutation re-renders board, list, panel and task page in the same round trip. */
function refresh() {
  revalidatePath("/", "layout");
}

export async function createTaskAction(input: CreateTaskInput): Promise<ActionResult<{ id: string; path: string }>> {
  const actor = await requireActor();
  return runAction(async () => {
    const task = await createTask(db(), actor, input);
    refresh();
    return { id: task.id, path: task.path };
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

export async function updateChecklistItemTextAction(itemId: string, text: string): Promise<ActionResult<void>> {
  const actor = await requireActor();
  return runAction(async () => {
    await setChecklistItemText(db(), actor, itemId, text);
    refresh();
  });
}

export async function reorderChecklistAction(taskId: string, orderedIds: string[]): Promise<ActionResult<void>> {
  const actor = await requireActor();
  return runAction(async () => {
    await reorderChecklist(db(), actor, taskId, orderedIds);
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

export async function addDependencyAction(blockerId: string, blockedId: string, lagDays: number): Promise<ActionResult<{ movedCount: number }>> {
  const actor = await requireActor();
  return runAction(async () => {
    const result = await addDependency(db(), actor, blockerId, blockedId, lagDays);
    refresh();
    return { movedCount: result.movedCount };
  });
}

export async function previewDependencyAction(blockerId: string, blockedId: string, lagDays: number): Promise<ActionResult<{ moves: DependencyPreviewMove[] }>> {
  const actor = await requireActor();
  return runAction(async () => ({ moves: await previewDependency(db(), actor, blockerId, blockedId, lagDays) }));
}

export async function updateDependencyLagAction(blockerId: string, blockedId: string, lagDays: number): Promise<ActionResult<{ movedCount: number }>> {
  const actor = await requireActor();
  return runAction(async () => {
    const result = await updateDependencyLag(db(), actor, blockerId, blockedId, lagDays);
    refresh();
    return { movedCount: result.movedCount };
  });
}

export async function removeDependencyAction(blockerId: string, blockedId: string): Promise<ActionResult<void>> {
  const actor = await requireActor();
  return runAction(async () => {
    await removeDependency(db(), actor, blockerId, blockedId);
    refresh();
  });
}

export async function createCommentAction(taskId: string, body: string): Promise<ActionResult<void>> {
  const actor = await requireActor();
  return runAction(async () => {
    await createComment(db(), actor, taskId, body);
    refresh();
  });
}

export async function updateCommentAction(commentId: string, body: string): Promise<ActionResult<void>> {
  const actor = await requireActor();
  return runAction(async () => {
    await updateComment(db(), actor, commentId, body);
    refresh();
  });
}

export async function deleteCommentAction(commentId: string): Promise<ActionResult<void>> {
  const actor = await requireActor();
  return runAction(async () => {
    await deleteComment(db(), actor, commentId);
    refresh();
  });
}

export async function deleteAttachmentAction(attachmentId: string): Promise<ActionResult<void>> {
  const actor = await requireActor();
  return runAction(async () => {
    await deleteAttachment(db(), actor, attachmentId, getEnv().UPLOAD_DIR);
    refresh();
  });
}
