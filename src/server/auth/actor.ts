import type { DB } from "@/server/db/client";
import type { Actor } from "@/server/permissions";
import { findActiveUser } from "@/server/users/service";

export async function resolveActor(db: DB, userId: string | null | undefined): Promise<Actor | null> {
  if (!userId) return null;
  const user = await findActiveUser(db, userId);
  return user ? { id: user.id, role: user.role, name: user.name, email: user.email } : null;
}
