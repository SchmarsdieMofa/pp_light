import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { parseMentionIds } from "@/lib/mentions";
import { recordActivity } from "@/server/activity/service";
import type { DB, Executor } from "@/server/db/client";
import { commentMentions, comments, projectAccess, users } from "@/server/db/schema";
import { DomainError } from "@/server/errors";
import { assertCan, can, projectCtx, type Actor } from "@/server/permissions";
import { loadTaskAccess } from "@/server/tasks/access";

export const commentBodySchema = z.string().trim().min(1, "Kommentar fehlt").max(10_000, "Höchstens 10000 Zeichen");

export type Comment = typeof comments.$inferSelect;
export type CommentView = Comment & { authorName: string; mentionIds: string[] };

/** Stores the mentions of `body` that point at members of the project. */
async function syncMentions(ex: Executor, commentId: string, projectId: string, body: string): Promise<void> {
  await ex.delete(commentMentions).where(eq(commentMentions.commentId, commentId));
  const ids = parseMentionIds(body);
  if (ids.length === 0) return;
  const members = await ex
    .select({ userId: projectAccess.userId })
    .from(projectAccess)
    .where(and(eq(projectAccess.projectId, projectId), inArray(projectAccess.userId, ids)));
  if (members.length > 0) {
    await ex.insert(commentMentions).values(members.map((m) => ({ commentId, userId: m.userId })));
  }
}

async function loadComment(db: DB, actor: Actor, commentId: string) {
  const notFound = new DomainError("NOT_FOUND", "Kommentar nicht gefunden.");
  if (!z.uuid().safeParse(commentId).success) throw notFound;
  const [comment] = await db.select().from(comments).where(eq(comments.id, commentId)).limit(1);
  if (!comment) throw notFound;
  const access = await loadTaskAccess(db, actor, comment.taskId);
  return { comment, ...access };
}

export async function createComment(db: DB, actor: Actor, taskId: string, rawBody: string): Promise<Comment> {
  const body = commentBodySchema.parse(rawBody);
  const { task, role } = await loadTaskAccess(db, actor, taskId);
  assertCan(actor, "comment.create", projectCtx(role));
  return db.transaction(async (tx) => {
    const [comment] = await tx.insert(comments).values({ taskId: task.id, authorId: actor.id, body }).returning();
    await syncMentions(tx, comment.id, task.projectId, body);
    await recordActivity(tx, {
      projectId: task.projectId,
      taskId: task.id,
      actorId: actor.id,
      action: "comment.added",
      diff: { commentId: comment.id },
    });
    return comment;
  });
}

export async function updateComment(db: DB, actor: Actor, commentId: string, rawBody: string): Promise<void> {
  const body = commentBodySchema.parse(rawBody);
  const { comment, task, role } = await loadComment(db, actor, commentId);
  assertCan(actor, "comment.editOwn", { ...projectCtx(role), isAuthor: comment.authorId === actor.id });
  // Admins pass `can` for everything; only the author edits the wording of a comment.
  if (comment.authorId !== actor.id) throw new DomainError("FORBIDDEN", "Nur eigene Kommentare lassen sich bearbeiten.");
  await db.transaction(async (tx) => {
    await tx.update(comments).set({ body, editedAt: new Date() }).where(eq(comments.id, comment.id));
    await syncMentions(tx, comment.id, task.projectId, body);
  });
}

export async function deleteComment(db: DB, actor: Actor, commentId: string): Promise<void> {
  const { comment, role } = await loadComment(db, actor, commentId);
  const isAuthor = comment.authorId === actor.id;
  if (!isAuthor && !can(actor, "project.update", projectCtx(role))) {
    throw new DomainError("FORBIDDEN", "Dafür fehlt die Berechtigung.");
  }
  await db.delete(comments).where(eq(comments.id, comment.id));
}

export async function listComments(db: DB, taskId: string): Promise<CommentView[]> {
  const rows = await db
    .select({ comment: comments, authorName: users.name })
    .from(comments)
    .innerJoin(users, eq(users.id, comments.authorId))
    .where(eq(comments.taskId, taskId))
    .orderBy(asc(comments.createdAt), asc(comments.id));
  if (rows.length === 0) return [];
  const mentions = await db
    .select()
    .from(commentMentions)
    .where(inArray(commentMentions.commentId, rows.map((r) => r.comment.id)));
  return rows.map((r) => ({
    ...r.comment,
    authorName: r.authorName,
    mentionIds: mentions.filter((m) => m.commentId === r.comment.id).map((m) => m.userId),
  }));
}
