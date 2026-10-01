import "server-only";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/server/db/client";
import type { Actor } from "@/server/permissions";
import { resolveActor } from "./actor";

/** Session user, re-checked against the DB on every request (deactivation takes effect immediately). */
export async function getActor(): Promise<Actor | null> {
  const session = await auth();
  const sessionVersion = (session as { sv?: number } | null)?.sv;
  return resolveActor(db(), session?.user?.id, sessionVersion);
}

export async function requireActor(): Promise<Actor> {
  const actor = await getActor();
  if (!actor) redirect("/login");
  return actor;
}
