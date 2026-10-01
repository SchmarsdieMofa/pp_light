import "server-only";
import { notFound } from "next/navigation";
import { cache } from "react";
import { requireActor } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { getProjectForUser } from "./service";

/** Per-request cached: layout and page share one lookup. Non-members get a 404. */
export const loadProject = cache(async (id: string) => {
  const actor = await requireActor();
  const access = await getProjectForUser(db(), actor, id);
  if (!access) notFound();
  return { actor, ...access };
});
