"use server";

import { revalidatePath } from "next/cache";
import { runAction, type ActionResult } from "@/server/action-result";
import { requireActor } from "@/server/auth/session";
import { db } from "@/server/db/client";
import {
  askQuestion,
  deletePost,
  deleteQuestion,
  editPost,
  postAnswer,
  renameQuestion,
  reopenQuestion,
  resolveQuestion,
} from "@/server/questions/service";

/** Questions show in the tab, its counter and the inbox: refresh them all. */
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

export async function askQuestionAction(projectId: string, input: { title: string; body: string }): Promise<ActionResult<{ id: string }>> {
  const actor = await requireActor();
  return runAction(async () => {
    const question = await askQuestion(db(), actor, projectId, input);
    refresh();
    return question;
  });
}

export async function postAnswerAction(questionId: string, body: string) {
  return mutate((actor) => postAnswer(db(), actor, questionId, body));
}

export async function editPostAction(postId: string, body: string) {
  return mutate((actor) => editPost(db(), actor, postId, body));
}

export async function deletePostAction(postId: string) {
  return mutate((actor) => deletePost(db(), actor, postId));
}

export async function renameQuestionAction(questionId: string, title: string) {
  return mutate((actor) => renameQuestion(db(), actor, questionId, title));
}

export async function deleteQuestionAction(questionId: string) {
  return mutate((actor) => deleteQuestion(db(), actor, questionId));
}

export async function resolveQuestionAction(questionId: string, summary: string) {
  return mutate((actor) => resolveQuestion(db(), actor, questionId, summary));
}

export async function reopenQuestionAction(questionId: string) {
  return mutate((actor) => reopenQuestion(db(), actor, questionId));
}
