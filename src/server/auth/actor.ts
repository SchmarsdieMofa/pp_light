import type { DB } from "@/server/db/client";
import type { Actor } from "@/server/permissions";
import { findActiveUser } from "@/server/users/service";

/** `sessionVersion` comes from the session; an older value (password reset since login) ends the session. */
export async function resolveActor(
  db: DB,
  userId: string | null | undefined,
  sessionVersion?: number,
): Promise<Actor | null> {
  if (!userId) return null;
  const user = await findActiveUser(db, userId);
  if (user && (sessionVersion ?? 0) !== user.sessionVersion) return null;
  return user ? { id: user.id, role: user.role, name: user.name, email: user.email } : null;
}
