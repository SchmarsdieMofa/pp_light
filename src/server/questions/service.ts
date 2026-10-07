import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { MENTION_PATTERN, parseMentionIds } from "@/lib/mentions";
import type { QuestionStatus } from "@/lib/enums";
import type { DB, Executor } from "@/server/db/client";
import { projectAccess, projects, questionPostMentions, questionPosts, questions, tasks, users } from "@/server/db/schema";
import { DomainError } from "@/server/errors";
import { assertCan, can, projectCtx, type Actor } from "@/server/permissions";
import { requireProjectAccess } from "@/server/projects/service";
import { createTask } from "@/server/tasks/service";
import { notifyQuestion } from "./notify";

export const questionTitleSchema = z.string().trim().min(1, "Titel fehlt").max(200, "Höchstens 200 Zeichen");
export const questionBodySchema = z.string().trim().min(1, "Text fehlt").max(10_000, "Höchstens 10000 Zeichen");
export const questionSummarySchema = z.string().trim().min(1, "Bitte fasse kurz zusammen, was geklärt wurde.").max(5_000, "Höchstens 5000 Zeichen");

export type QuestionRow = {
  id: string;
  projectId: string;
  title: string;
  status: QuestionStatus;
  authorId: string;
  authorName: string;
  summary: string;
  resolvedByName: string | null;
  resolvedAt: Date | null;
  createdAt: Date;
  lastActivityAt: Date;
  /** Posts including the question text itself. */
  postCount: number;
};
export type PostView = {
  id: string;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: Date;
  editedAt: Date | null;
  mentionIds: string[];
  /** The question text itself (the first post); it is edited with the question, never deleted alone. */
  isQuestion: boolean;
};
export type QuestionDetail = QuestionRow & {
  posts: PostView[];
  /** The actor may rename or delete the question and remove others posts. */
  canManage: boolean;
  canWrite: boolean;
  /** The actor may turn the question into a task. */
  canCreateTask: boolean;
};

/** Everything in a project is readable by its people; writing needs a role that is not read-only (archived projects). */
async function requireProject(db: DB, actor: Actor, projectId: string) {
  const access = await requireProjectAccess(db, actor, projectId);
  return access;
}

async function requireQuestion(db: DB, actor: Actor, questionId: string) {
  const notFound = new DomainError("NOT_FOUND", "Frage nicht gefunden.");
  if (!z.uuid().safeParse(questionId).success) throw notFound;
  const [question] = await db.select().from(questions).where(eq(questions.id, questionId)).limit(1);
  if (!question) throw notFound;
  const access = await requireProjectAccess(db, actor, question.projectId).catch(() => {
    throw notFound;
  });
  return { question, access };
}

/** Stores the mentions of `body` that point at people of the project; returns their ids. */
async function syncMentions(ex: Executor, postId: string, projectId: string, body: string): Promise<string[]> {
  await ex.delete(questionPostMentions).where(eq(questionPostMentions.postId, postId));
  const ids = parseMentionIds(body);
  if (ids.length === 0) return [];
  const members = await ex
    .select({ userId: projectAccess.userId })
    .from(projectAccess)
    .where(and(eq(projectAccess.projectId, projectId), inArray(projectAccess.userId, ids)));
  if (members.length > 0) await ex.insert(questionPostMentions).values(members.map((m) => ({ postId, userId: m.userId })));
  return members.map((m) => m.userId);
}

export async function askQuestion(db: DB, actor: Actor, projectId: string, input: { title: string; body: string }): Promise<{ id: string }> {
  const title = questionTitleSchema.parse(input.title);
  const body = questionBodySchema.parse(input.body);
  const { project, role } = await requireProject(db, actor, projectId);
  assertCan(actor, "question.ask", projectCtx(role));
  return db.transaction(async (tx) => {
    const [question] = await tx.insert(questions).values({ projectId: project.id, title, authorId: actor.id }).returning();
    const [post] = await tx.insert(questionPosts).values({ questionId: question.id, authorId: actor.id, body }).returning();
    const mentioned = await syncMentions(tx, post.id, project.id, body);
    await notifyQuestion(tx, { question, actor, kind: "asked", postId: post.id, mentionedIds: mentioned });
    return { id: question.id };
  });
}

export async function postAnswer(db: DB, actor: Actor, questionId: string, rawBody: string): Promise<void> {
  const body = questionBodySchema.parse(rawBody);
  const { question, access } = await requireQuestion(db, actor, questionId);
  assertCan(actor, "question.ask", projectCtx(access.role));
  await db.transaction(async (tx) => {
    const [post] = await tx.insert(questionPosts).values({ questionId: question.id, authorId: actor.id, body }).returning();
    const mentioned = await syncMentions(tx, post.id, question.projectId, body);
    await tx.update(questions).set({ lastActivityAt: new Date() }).where(eq(questions.id, question.id));
    await notifyQuestion(tx, { question, actor, kind: "answered", postId: post.id, mentionedIds: mentioned });
  });
}

async function requirePost(db: DB, actor: Actor, postId: string) {
  const notFound = new DomainError("NOT_FOUND", "Beitrag nicht gefunden.");
  if (!z.uuid().safeParse(postId).success) throw notFound;
  const [post] = await db.select().from(questionPosts).where(eq(questionPosts.id, postId)).limit(1);
  if (!post) throw notFound;
  const found = await requireQuestion(db, actor, post.questionId);
  return { post, ...found };
}

/** Only the author edits the wording of their own post. */
export async function editPost(db: DB, actor: Actor, postId: string, rawBody: string): Promise<void> {
  const body = questionBodySchema.parse(rawBody);
  const { post, question, access } = await requirePost(db, actor, postId);
  assertCan(actor, "question.ask", projectCtx(access.role));
  if (post.authorId !== actor.id) throw new DomainError("FORBIDDEN", "Nur eigene Beiträge lassen sich bearbeiten.");
  await db.transaction(async (tx) => {
    await tx.update(questionPosts).set({ body, editedAt: new Date() }).where(eq(questionPosts.id, post.id));
    await syncMentions(tx, post.id, question.projectId, body);
  });
}

/** The author or a project owner removes a post; the question text itself goes only with the question. */
export async function deletePost(db: DB, actor: Actor, postId: string): Promise<void> {
  const { post, question, access } = await requirePost(db, actor, postId);
  assertCan(actor, "question.ask", projectCtx(access.role));
  if (post.authorId !== actor.id && !can(actor, "project.update", projectCtx(access.role))) {
    throw new DomainError("FORBIDDEN", "Dafür fehlt die Berechtigung.");
  }
  const [first] = await db.select({ id: questionPosts.id }).from(questionPosts).where(eq(questionPosts.questionId, question.id)).orderBy(asc(questionPosts.createdAt), asc(questionPosts.id)).limit(1);
  if (first?.id === post.id) throw new DomainError("VALIDATION", "Der Fragetext lässt sich nur mit der ganzen Frage löschen.");
  await db.delete(questionPosts).where(eq(questionPosts.id, post.id));
}

function canManageQuestion(actor: Actor, question: { authorId: string }, role: Parameters<typeof projectCtx>[0]) {
  return question.authorId === actor.id || can(actor, "project.update", projectCtx(role));
}

export async function renameQuestion(db: DB, actor: Actor, questionId: string, rawTitle: string): Promise<void> {
  const title = questionTitleSchema.parse(rawTitle);
  const { question, access } = await requireQuestion(db, actor, questionId);
  assertCan(actor, "question.ask", projectCtx(access.role));
  if (!canManageQuestion(actor, question, access.role)) throw new DomainError("FORBIDDEN", "Dafür fehlt die Berechtigung.");
  await db.update(questions).set({ title }).where(eq(questions.id, question.id));
}

export async function deleteQuestion(db: DB, actor: Actor, questionId: string): Promise<void> {
  const { question, access } = await requireQuestion(db, actor, questionId);
  assertCan(actor, "question.ask", projectCtx(access.role));
  if (!canManageQuestion(actor, question, access.role)) throw new DomainError("FORBIDDEN", "Dafür fehlt die Berechtigung.");
  await db.delete(questions).where(eq(questions.id, question.id));
}

/** Everyone with access to the project may close a question – but only with a summary of what was settled. */
export async function resolveQuestion(db: DB, actor: Actor, questionId: string, rawSummary: string): Promise<void> {
  const summary = questionSummarySchema.parse(rawSummary);
  const { question, access } = await requireQuestion(db, actor, questionId);
  assertCan(actor, "question.ask", projectCtx(access.role));
  await db.transaction(async (tx) => {
    await tx
      .update(questions)
      .set({ status: "resolved", summary, resolvedBy: actor.id, resolvedAt: new Date(), lastActivityAt: new Date() })
      .where(eq(questions.id, question.id));
    await notifyQuestion(tx, { question, actor, kind: "resolved", mentionedIds: [] });
  });
}

export async function reopenQuestion(db: DB, actor: Actor, questionId: string): Promise<void> {
  const { question, access } = await requireQuestion(db, actor, questionId);
  assertCan(actor, "question.ask", projectCtx(access.role));
  if (question.status === "open") return;
  await db.transaction(async (tx) => {
    // The summary stays as a starting point for the next resolution.
    await tx.update(questions).set({ status: "open", resolvedBy: null, resolvedAt: null, lastActivityAt: new Date() }).where(eq(questions.id, question.id));
    await notifyQuestion(tx, { question, actor, kind: "reopened", mentionedIds: [] });
  });
}

function rowSelection() {
  return {
    id: questions.id,
    projectId: questions.projectId,
    title: questions.title,
    status: questions.status,
    authorId: questions.authorId,
    authorName: users.name,
    summary: questions.summary,
    resolvedByName: sql<string | null>`(select name from users where id = ${questions.resolvedBy})`,
    resolvedAt: questions.resolvedAt,
    createdAt: questions.createdAt,
    lastActivityAt: questions.lastActivityAt,
    postCount: sql<number>`(select count(*)::int from ${questionPosts} where ${questionPosts.questionId} = ${questions.id})`,
  };
}

/** The project's questions, most recently active first. */
export async function listQuestions(db: DB, actor: Actor, projectId: string, status?: QuestionStatus): Promise<QuestionRow[]> {
  await requireProject(db, actor, projectId);
  return db
    .select(rowSelection())
    .from(questions)
    .innerJoin(users, eq(users.id, questions.authorId))
    .where(and(eq(questions.projectId, projectId), status ? eq(questions.status, status) : undefined))
    .orderBy(desc(questions.lastActivityAt), desc(questions.id));
}

export async function countOpenQuestions(db: DB, projectId: string): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(questions).where(and(eq(questions.projectId, projectId), eq(questions.status, "open")));
  return row.n;
}

export async function getQuestion(db: DB, actor: Actor, questionId: string): Promise<QuestionDetail | null> {
  let found;
  try {
    found = await requireQuestion(db, actor, questionId);
  } catch (err) {
    if (err instanceof DomainError && err.code === "NOT_FOUND") return null;
    throw err;
  }
  const { question, access } = found;
  const [[row], postRows] = await Promise.all([
    db.select(rowSelection()).from(questions).innerJoin(users, eq(users.id, questions.authorId)).where(eq(questions.id, question.id)).limit(1),
    db
      .select({ post: questionPosts, authorName: users.name })
      .from(questionPosts)
      .innerJoin(users, eq(users.id, questionPosts.authorId))
      .where(eq(questionPosts.questionId, question.id))
      .orderBy(asc(questionPosts.createdAt), asc(questionPosts.id)),
  ]);
  const mentions = postRows.length
    ? await db.select().from(questionPostMentions).where(inArray(questionPostMentions.postId, postRows.map((r) => r.post.id)))
    : [];
  return {
    ...row,
    posts: postRows.map((r, index) => ({
      id: r.post.id,
      authorId: r.post.authorId,
      authorName: r.authorName,
      body: r.post.body,
      createdAt: r.post.createdAt,
      editedAt: r.post.editedAt,
      mentionIds: mentions.filter((m) => m.postId === r.post.id).map((m) => m.userId),
      isQuestion: index === 0,
    })),
    canManage: canManageQuestion(actor, question, access.role),
    canWrite: can(actor, "question.ask", projectCtx(access.role)),
    canCreateTask: can(actor, "task.create", projectCtx(access.role)),
  };
}

/**
 * Turns a question into a task: titled like the question, described with what was settled (or, while it is open,
 * the question itself). The thread stays as it is; mentions become plain names in the description.
 */
export async function createTaskFromQuestion(db: DB, actor: Actor, questionId: string): Promise<{ id: string; reference: string }> {
  const { question, access } = await requireQuestion(db, actor, questionId);
  assertCan(actor, "task.create", projectCtx(access.role));
  const [first] = await db
    .select({ body: questionPosts.body })
    .from(questionPosts)
    .where(eq(questionPosts.questionId, question.id))
    .orderBy(asc(questionPosts.createdAt), asc(questionPosts.id))
    .limit(1);
  const source = question.status === "resolved" && question.summary ? question.summary : (first?.body ?? "");
  const description = `Aus der Frage „${question.title}“:\n\n${source.replace(MENTION_PATTERN, "@$1")}`.slice(0, 20_000);
  const task = await createTask(db, actor, { projectId: question.projectId, title: question.title.slice(0, 200) });
  await db.update(tasks).set({ description }).where(eq(tasks.id, task.id));
  const [project] = await db.select({ key: projects.key }).from(projects).where(eq(projects.id, question.projectId)).limit(1);
  return { id: task.id, reference: `${project.key}-${task.path}` };
}
