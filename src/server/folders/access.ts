import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { ProjectRole } from "@/lib/enums";
import type { Executor } from "@/server/db/client";
import { folderAccess, projectFolders } from "@/server/db/schema";
import { DomainError } from "@/server/errors";
import type { Actor } from "@/server/permissions";

/** Who may put projects into a folder: its owners and members (guests only look). */
const CREATING_ROLES: readonly ProjectRole[] = ["owner", "member"];

/** The actor's role in the folder, or NOT_FOUND – a folder one is not in does not exist for them. */
export async function requireFolderRole(ex: Executor, actor: Actor, folderId: string): Promise<{ folder: typeof projectFolders.$inferSelect; role: ProjectRole }> {
  const [row] = z.uuid().safeParse(folderId).success
    ? await ex
        .select({ folder: projectFolders, role: folderAccess.role })
        .from(projectFolders)
        .innerJoin(folderAccess, and(eq(folderAccess.folderId, projectFolders.id), eq(folderAccess.userId, actor.id)))
        .where(eq(projectFolders.id, folderId))
        .limit(1)
    : [];
  if (!row) throw new DomainError("NOT_FOUND", "Ordner nicht gefunden.");
  return row;
}

export async function requireFolderOwner(ex: Executor, actor: Actor, folderId: string) {
  const access = await requireFolderRole(ex, actor, folderId);
  if (access.role !== "owner") throw new DomainError("FORBIDDEN", "Das dürfen nur Owner des Ordners.");
  return access.folder;
}

/** Throws unless the actor may put projects into the folder (owner or member of it). */
export async function assertCanFillFolder(ex: Executor, actor: Actor, folderId: string): Promise<void> {
  const { role } = await requireFolderRole(ex, actor, folderId);
  if (!CREATING_ROLES.includes(role)) throw new DomainError("FORBIDDEN", "Gäste eines Ordners können dort keine Projekte anlegen.");
}
