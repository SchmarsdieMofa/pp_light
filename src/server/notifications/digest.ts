import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { DB } from "@/server/db/client";
import { mailOutbox, notificationPreferences, notifications, projectMembers, users } from "@/server/db/schema";
import { sendMail } from "@/server/mail/service";
import { openMailBody } from "@/server/mail/crypto";

/** One worker may handle a user's digest at a time, even across worker replicas. */
export async function sendPendingDigests(db: DB, now = new Date()): Promise<number> {
  const candidates = await db.selectDistinct({ userId: notifications.userId }).from(notifications)
    .where(isNull(notifications.emailedAt));
  let sent = 0;
  for (const { userId } of candidates) {
    await db.transaction(async (tx) => {
      const { rows: [lock] } = await tx.execute(sql`select pg_try_advisory_xact_lock(hashtext(${userId})) as acquired`);
      if (!lock?.acquired) return;
      const [user] = await tx.select().from(users).where(and(eq(users.id, userId), eq(users.active, true)));
      if (!user) return;
      const [prefs] = await tx.select().from(notificationPreferences).where(eq(notificationPreferences.userId, userId));
      if (prefs?.lastDigestAt && now.getTime() - prefs.lastDigestAt.getTime() < 10 * 60_000) return;
      const pending = await tx.select({ id: notifications.id, type: notifications.type, message: notifications.message,
        projectId: notifications.projectId, memberId: projectMembers.userId })
        .from(notifications).leftJoin(projectMembers, and(eq(projectMembers.userId, userId), eq(projectMembers.projectId, notifications.projectId)))
        .where(and(eq(notifications.userId, userId), isNull(notifications.emailedAt)))
        .orderBy(asc(notifications.createdAt)).limit(100);
      if (pending.length === 0) return;
      const enabled = pending.filter((notice) => (user.role === "admin" || !notice.projectId || notice.memberId)
        && !prefs?.disabledEmailTypes.includes(notice.type));
      if (enabled.length > 0) {
        await sendMail(user.email, `pp_light: ${enabled.length} neue Benachrichtigungen`,
          `${enabled.map((notice) => `• ${notice.message}`).join("\n")}\n\n${process.env.APP_URL ?? "http://localhost:3000"}/inbox`);
        await tx.insert(notificationPreferences).values({ userId, lastDigestAt: now })
          .onConflictDoUpdate({ target: notificationPreferences.userId, set: { lastDigestAt: now } });
        sent++;
      }
      await tx.update(notifications).set({ emailedAt: now }).where(inArray(notifications.id, pending.map((notice) => notice.id)));
    });
  }
  return sent;
}

export async function sendPendingOutbox(db: DB, now = new Date()): Promise<number> {
  const messages = await db.select().from(mailOutbox).where(isNull(mailOutbox.sentAt))
    .orderBy(asc(mailOutbox.createdAt)).limit(100);
  let sent = 0;
  for (const item of messages) {
    await db.transaction(async (tx) => {
      const { rows: [lock] } = await tx.execute(sql`select pg_try_advisory_xact_lock(hashtext(${item.id})) as acquired`);
      if (!lock?.acquired) return;
      const [fresh] = await tx.select().from(mailOutbox).where(and(eq(mailOutbox.id, item.id), isNull(mailOutbox.sentAt)));
      if (!fresh) return;
      await sendMail(fresh.toEmail, fresh.subject, openMailBody(fresh.body));
      await tx.update(mailOutbox).set({ sentAt: now }).where(eq(mailOutbox.id, item.id));
      sent++;
    });
  }
  return sent;
}
