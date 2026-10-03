"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { requestProto } from "@/lib/access-redirect";
import { runAction, type ActionResult } from "@/server/action-result";
import { requireActor } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { requestBackup } from "@/server/backups/service";
import { setBaseUrl, setHttpsOnly } from "@/server/settings/service";
import { changeOwnPassword, updateOwnName } from "@/server/users/account";

export async function updateOwnNameAction(name: string): Promise<ActionResult<void>> {
  const actor = await requireActor();
  return runAction(async () => {
    await updateOwnName(db(), actor, name);
    revalidatePath("/", "layout");
  });
}

/** On success every session ends; the client then signs out. */
export async function changeOwnPasswordAction(current: string, next: string): Promise<ActionResult<void>> {
  const actor = await requireActor();
  return runAction(() => changeOwnPassword(db(), actor, current, next));
}

/** Queues a backup for the backup container (admins only). */
export async function requestBackupAction(): Promise<ActionResult<void>> {
  const actor = await requireActor();
  return runAction(async () => {
    await requestBackup(db(), actor);
    revalidatePath("/", "layout");
  });
}

/** Address used in links in mails (admins only). */
export async function setBaseUrlAction(url: string): Promise<ActionResult<void>> {
  const actor = await requireActor();
  return runAction(async () => {
    await setBaseUrl(db(), actor, url);
    revalidatePath("/", "layout");
  });
}

/** HTTPS-only can only be switched on over HTTPS – the scheme of this very request decides. */
export async function setHttpsOnlyAction(on: boolean): Promise<ActionResult<void>> {
  const actor = await requireActor();
  const h = await headers();
  return runAction(async () => {
    await setHttpsOnly(db(), actor, on, requestProto(h, "http:"));
    revalidatePath("/", "layout");
  });
}
