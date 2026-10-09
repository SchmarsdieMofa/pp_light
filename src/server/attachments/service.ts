import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { recordActivity } from "@/server/activity/service";
import type { DB } from "@/server/db/client";
import { attachments, users } from "@/server/db/schema";
import { DomainError } from "@/server/errors";
import { assertCan, can, projectCtx, type Actor } from "@/server/permissions";
import { loadTaskAccess } from "@/server/tasks/access";

export type Attachment = typeof attachments.$inferSelect;
export type AttachmentView = Attachment & { uploaderName: string };
export type UploadedFile = { name: string; type: string; data: Uint8Array };

const INLINE_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
const MIME_PATTERN = /^[a-z0-9][a-z0-9!#$&^_.+-]{0,63}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,63}$/i;

/** Last path segment without control characters or quotes – never used as a path, only for display/headers. */
export function safeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const cleaned = base.replace(/[\u0000-\u001f\u007f"]/g, "").trim().slice(0, 200);
  return cleaned || "datei";
}

/** RFC 6266/5987: ASCII fallback plus UTF-8 name. */
export function contentDisposition(filename: string, inline: boolean): string {
  const ascii = filename.replace(/[^\x20-\x7e]|["\\%]/g, "_");
  const encoded = encodeURIComponent(filename).replace(/['()*!]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `${inline ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

/** Only raster images may be shown inline; SVG can carry scripts. */
export function isInlineImage(mime: string): boolean {
  return INLINE_IMAGE_TYPES.has(mime);
}

/** Resolves a storage key inside the upload directory and refuses anything that would escape it. */
export function storagePath(uploadDir: string, storageKey: string): string {
  const root = resolve(uploadDir);
  const path = resolve(root, storageKey);
  if (!path.startsWith(root + sep)) throw new DomainError("NOT_FOUND", "Anhang nicht gefunden.");
  return path;
}

export async function saveAttachment(
  db: DB,
  actor: Actor,
  taskId: string,
  file: UploadedFile,
  opts: { uploadDir: string; maxBytes: number },
): Promise<Attachment> {
  const { task, role } = await loadTaskAccess(db, actor, taskId);
  assertCan(actor, "attachment.upload", projectCtx(role));
  if (file.data.byteLength === 0) throw new DomainError("VALIDATION", "Die Datei ist leer.");
  if (file.data.byteLength > opts.maxBytes) {
    throw new DomainError("TOO_LARGE", `Die Datei ist zu groß (höchstens ${Math.floor(opts.maxBytes / 1024 / 1024) || 1} MB).`);
  }
  const storageKey = randomUUID();
  const path = storagePath(opts.uploadDir, storageKey);
  await mkdir(resolve(opts.uploadDir), { recursive: true });
  await writeFile(path, file.data);
  try {
    return await db.transaction(async (tx) => {
      const [attachment] = await tx
        .insert(attachments)
        .values({
          taskId: task.id,
          filename: safeFilename(file.name),
          mime: MIME_PATTERN.test(file.type) ? file.type.toLowerCase() : "application/octet-stream",
          size: file.data.byteLength,
          storageKey,
          uploadedBy: actor.id,
        })
        .returning();
      await recordActivity(tx, {
        projectId: task.projectId,
        taskId: task.id,
        actorId: actor.id,
        action: "attachment.added",
        diff: { attachmentId: attachment.id, filename: attachment.filename },
      });
      return attachment;
    });
  } catch (err) {
    await rm(path, { force: true });
    throw err;
  }
}

async function loadAttachment(db: DB, actor: Actor, attachmentId: string) {
  const notFound = new DomainError("NOT_FOUND", "Anhang nicht gefunden.");
  if (!z.uuid().safeParse(attachmentId).success) throw notFound;
  const [attachment] = await db.select().from(attachments).where(eq(attachments.id, attachmentId)).limit(1);
  if (!attachment) throw notFound;
  const access = await loadTaskAccess(db, actor, attachment.taskId);
  return { attachment, ...access };
}

/** Anyone who may see the project may download; outsiders get NOT_FOUND (no existence leak). */
export async function getAttachmentForDownload(db: DB, actor: Actor, attachmentId: string, uploadDir: string) {
  const { attachment } = await loadAttachment(db, actor, attachmentId);
  return { attachment, path: storagePath(uploadDir, attachment.storageKey) };
}

export async function deleteAttachment(db: DB, actor: Actor, attachmentId: string, uploadDir: string): Promise<void> {
  const { attachment, task, role } = await loadAttachment(db, actor, attachmentId);
  if (attachment.uploadedBy !== actor.id && !can(actor, "project.update", projectCtx(role))) {
    throw new DomainError("FORBIDDEN", "Dafür fehlt die Berechtigung.");
  }
  await db.transaction(async (tx) => {
    await tx.delete(attachments).where(eq(attachments.id, attachment.id));
    await recordActivity(tx, {
      projectId: task.projectId,
      taskId: task.id,
      actorId: actor.id,
      action: "attachment.removed",
      diff: { filename: attachment.filename },
    });
  });
  await rm(storagePath(uploadDir, attachment.storageKey), { force: true });
}

export async function listAttachments(db: DB, taskId: string): Promise<AttachmentView[]> {
  const rows = await db
    .select({ attachment: attachments, uploaderName: users.name })
    .from(attachments)
    .innerJoin(users, eq(users.id, attachments.uploadedBy))
    .where(eq(attachments.taskId, taskId))
    .orderBy(asc(attachments.createdAt), asc(attachments.id));
  return rows.map((r) => ({ ...r.attachment, uploaderName: r.uploaderName }));
}
