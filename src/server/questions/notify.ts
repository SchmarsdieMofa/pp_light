import { and, eq, inArray } from "drizzle-orm";
import type { NotificationType } from "@/lib/notification-types";
import type { Executor } from "@/server/db/client";
import { notifications, projectAccess, projects, questionPosts, users, type questions } from "@/server/db/schema";
import type { Actor } from "@/server/permissions";

type Kind = "asked" | "answered" | "resolved" | "reopened";

const VERB: Record<Kind, string> = {
  asked: "hat dich in einer Frage erwähnt",
  answered: "hat in der Frage geantwortet",
  resolved: "hat die Frage als geklärt markiert",
  reopened: "hat die Frage wieder geöffnet",
};

/**
 * Who hears about what: a new question only reaches the people it mentions (it would otherwise be noise for the whole
 * project). Answers reach the asker, everyone who wrote in the thread so far, and the mentioned. Closing and reopening
 * reach the asker and the writers. Mentions win over the plain "thread" notice. Only active people with access to the project.
 */
export async function notifyQuestion(
  ex: Executor,
  event: { question: typeof questions.$inferSelect; actor: Actor; kind: Kind; postId?: string; mentionedIds: string[] },
): Promise<void> {
  const { question, actor, kind } = event;
  const recipients = new Map<string, NotificationType>();
  if (kind !== "asked") {
    const writers = await ex.select({ userId: questionPosts.authorId }).from(questionPosts).where(eq(questionPosts.questionId, question.id));
    const type: NotificationType = kind === "answered" ? "question" : "questionResolved";
    for (const id of [question.authorId, ...writers.map((w) => w.userId)]) recipients.set(id, type);
  }
  for (const id of event.mentionedIds) recipients.set(id, "mentioned");
  recipients.delete(actor.id);
  if (recipients.size === 0) return;

  const allowed = await ex
    .select({ id: users.id })
    .from(users)
    .innerJoin(projectAccess, eq(projectAccess.userId, users.id))
    .where(and(eq(users.active, true), eq(projectAccess.projectId, question.projectId), inArray(users.id, [...recipients.keys()])));
  if (allowed.length === 0) return;
  const [project] = await ex.select({ key: projects.key }).from(projects).where(eq(projects.id, question.projectId)).limit(1);
  const stamp = event.postId ?? `${kind}:${Date.now()}`;
  const message = (type: NotificationType) =>
    `${actor.name} ${type === "mentioned" ? VERB.asked : VERB[kind]}: ${question.title}${project ? ` (${project.key})` : ""}`;
  await ex
    .insert(notifications)
    .values(
      allowed.map(({ id }) => {
        const type = recipients.get(id)!;
        return {
          userId: id,
          actorId: actor.id,
          projectId: question.projectId,
          questionId: question.id,
          type,
          message: message(type),
          eventKey: `q:${question.id}:${stamp}:${type}:${id}`,
        };
      }),
    )
    .onConflictDoNothing();
}
