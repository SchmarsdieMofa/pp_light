import { and, asc, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import { DEFAULT_DISABLED_EMAIL_TYPES } from "@/lib/notification-types";
import type { DB } from "@/server/db/client";
import { mailOutbox, notificationPreferences, notifications, projectAccess, users } from "@/server/db/schema";
import { sendMail } from "@/server/mail/service";
import { openMailBody } from "@/server/mail/crypto";
import { getBaseUrl } from "@/server/settings/service";

/** One worker may handle a user's digest at a time, even across worker replicas. */
export async function sendPendingDigests(db: DB, now = new Date()): Promise<number> {
  const candidates = await db
    .selectDistinct({ userId: notifications.userId })
    .from(notifications)
    .where(isNull(notifications.emailedAt));
  if (candidates.length === 0) return 0;
  const baseUrl = await getBaseUrl(db);
  let sent = 0;
  for (const { userId } of candidates) {
    // One failing recipient must not hold back everyone else; their notices stay pending for the next run.
    try {
      await db.transaction(async (tx) => {
        const {
          rows: [lock],
        } = await tx.execute(sql`select pg_try_advisory_xact_lock(hashtext(${userId})) as acquired`);
        if (!lock?.acquired) return;
        const [user] = await tx
          .select()
          .from(users)
          .where(and(eq(users.id, userId), eq(users.active, true)));
        if (!user) return;
        const [prefs] = await tx
          .select()
          .from(notificationPreferences)
          .where(eq(notificationPreferences.userId, userId));
        if (prefs?.lastDigestAt && now.getTime() - prefs.lastDigestAt.getTime() < 10 * 60_000) return;
        const pending = await tx
          .select({
            id: notifications.id,
            type: notifications.type,
            message: notifications.message,
            projectId: notifications.projectId,
            memberId: projectAccess.userId,
          })
          .from(notifications)
          .leftJoin(
            projectAccess,
            and(eq(projectAccess.userId, userId), eq(projectAccess.projectId, notifications.projectId)),
          )
          .where(and(eq(notifications.userId, userId), isNull(notifications.emailedAt)))
          .orderBy(asc(notifications.createdAt))
          .limit(100);
        if (pending.length === 0) return;
        // No row yet: nobody has chosen, the defaults apply.
        const disabledTypes: readonly string[] = prefs ? prefs.disabledEmailTypes : DEFAULT_DISABLED_EMAIL_TYPES;
        const enabled = pending.filter(
          (notice) =>
            (!notice.projectId || notice.memberId) &&
            !disabledTypes.includes(notice.type),
        );
        if (enabled.length > 0) {
          await sendMail(
            user.email,
            `pp_light: ${enabled.length} neue Benachrichtigungen`,
            `${enabled.map((notice) => `• ${notice.message}`).join("\n")}\n\n${baseUrl}/inbox`,
          );
          await tx
            .insert(notificationPreferences)
            .values({ userId, lastDigestAt: now })
            .onConflictDoUpdate({ target: notificationPreferences.userId, set: { lastDigestAt: now } });
          sent++;
        }
        await tx
          .update(notifications)
          .set({ emailedAt: now })
          .where(
            inArray(
              notifications.id,
              pending.map((notice) => notice.id),
            ),
          );
      });
    } catch (err) {
      console.error(`Digest für ${userId} fehlgeschlagen`, err);
    }
  }
  return sent;
}

export const OUTBOX_MAX_ATTEMPTS = 5;

export async function sendPendingOutbox(db: DB, now = new Date()): Promise<number> {
  const messages = await db
    .select()
    .from(mailOutbox)
    .where(and(isNull(mailOutbox.sentAt), isNull(mailOutbox.failedAt), lt(mailOutbox.attempts, OUTBOX_MAX_ATTEMPTS)))
    .orderBy(asc(mailOutbox.createdAt))
    .limit(100);
  let sent = 0;
  for (const item of messages) {
    try {
      await db.transaction(async (tx) => {
        const {
          rows: [lock],
        } = await tx.execute(sql`select pg_try_advisory_xact_lock(hashtext(${item.id})) as acquired`);
        if (!lock?.acquired) return;
        const [fresh] = await tx
          .select()
          .from(mailOutbox)
          .where(and(eq(mailOutbox.id, item.id), isNull(mailOutbox.sentAt)));
        if (!fresh) return;
        await sendMail(fresh.toEmail, fresh.subject, openMailBody(fresh.body));
        // The body holds one-time links: keep nothing readable once it is delivered.
        await tx.update(mailOutbox).set({ sentAt: now, body: "" }).where(eq(mailOutbox.id, item.id));
        sent++;
      });
    } catch (err) {
      // One undeliverable address must not block every later invitation or reset.
      const attempts = item.attempts + 1;
      await db
        .update(mailOutbox)
        .set({
          attempts,
          lastError: String(err instanceof Error ? err.message : err).slice(0, 500),
          failedAt: attempts >= OUTBOX_MAX_ATTEMPTS ? now : null,
        })
        .where(eq(mailOutbox.id, item.id));
      console.error(`Mail ${item.id} an ${item.toEmail} fehlgeschlagen (Versuch ${attempts})`, err);
    }
  }
  return sent;
}
