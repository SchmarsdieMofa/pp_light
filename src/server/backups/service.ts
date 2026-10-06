import { desc, eq, inArray } from "drizzle-orm";
import type { DB } from "@/server/db/client";
import { backupRuns, users } from "@/server/db/schema";
import { DomainError, isUniqueViolation } from "@/server/errors";
import { assertCan, type Actor } from "@/server/permissions";

export type BackupRun = {
  id: string;
  trigger: "manual" | "scheduled";
  status: "pending" | "running" | "done" | "failed";
  requestedByName: string | null;
  name: string | null;
  sizeBytes: number | null;
  error: string | null;
  createdAt: Date;
  finishedAt: Date | null;
};

/** Latest backups, newest first. Admins only – backups contain every project. */
export async function listBackupRuns(db: DB, actor: Actor, limit = 10): Promise<BackupRun[]> {
  assertCan(actor, "system.manage");
  return db
    .select({
      id: backupRuns.id,
      trigger: backupRuns.trigger,
      status: backupRuns.status,
      requestedByName: users.name,
      name: backupRuns.name,
      sizeBytes: backupRuns.sizeBytes,
      error: backupRuns.error,
      createdAt: backupRuns.createdAt,
      finishedAt: backupRuns.finishedAt,
    })
    .from(backupRuns)
    .leftJoin(users, eq(users.id, backupRuns.requestedBy))
    .orderBy(desc(backupRuns.createdAt))
    .limit(limit);
}

/** Queues a backup; the backup container picks it up within seconds. One at a time. */
export async function requestBackup(db: DB, actor: Actor): Promise<void> {
  assertCan(actor, "system.manage");
  const [active] = await db
    .select({ id: backupRuns.id })
    .from(backupRuns)
    .where(inArray(backupRuns.status, ["pending", "running"]))
    .limit(1);
  if (active) throw new DomainError("CONFLICT", "Es läuft bereits ein Backup.");
  try {
    await db.insert(backupRuns).values({ trigger: "manual", requestedBy: actor.id });
  } catch (err) {
    if (isUniqueViolation(err)) throw new DomainError("CONFLICT", "Es läuft bereits ein Backup.");
    throw err;
  }
}
