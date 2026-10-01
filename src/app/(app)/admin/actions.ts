"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/server/action-result";
import { requireActor } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { inviteUser, setUserActive } from "@/server/users/invitations";

export async function inviteUserAction(input: { email: string; name: string; role: "admin" | "member" }) {
  const actor = await requireActor();
  return runAction(async () => { await inviteUser(db(), actor, input); revalidatePath("/admin"); });
}

export async function setUserActiveAction(id: string, active: boolean) {
  const actor = await requireActor();
  return runAction(async () => { await setUserActive(db(), actor, id, active); revalidatePath("/admin"); });
}
