"use server";

import { revalidatePath } from "next/cache";
import type { GlobalRole } from "@/lib/enums";
import { runAction } from "@/server/action-result";
import { requireActor } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { setUserRole } from "@/server/users/account";
import { inviteUser, revokeInvitation, setUserActive } from "@/server/users/invitations";

export async function inviteUserAction(input: { email: string; name: string; role: GlobalRole }) {
  const actor = await requireActor();
  return runAction(async () => { await inviteUser(db(), actor, input); revalidatePath("/", "layout"); });
}

export async function setUserActiveAction(id: string, active: boolean) {
  const actor = await requireActor();
  return runAction(async () => { await setUserActive(db(), actor, id, active); revalidatePath("/", "layout"); });
}

export async function setUserRoleAction(id: string, role: GlobalRole) {
  const actor = await requireActor();
  return runAction(async () => { await setUserRole(db(), actor, id, role); revalidatePath("/", "layout"); });
}

export async function revokeInvitationAction(id: string) {
  const actor = await requireActor();
  return runAction(async () => { await revokeInvitation(db(), actor, id); revalidatePath("/", "layout"); });
}
