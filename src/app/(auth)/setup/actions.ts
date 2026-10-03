"use server";

import { headers } from "next/headers";
import { signIn } from "@/auth";
import { requestOrigin } from "@/lib/access-redirect";
import { clientIp } from "@/server/auth/credentials";
import { lockedFor, recordFailure } from "@/server/auth/throttle";
import { db } from "@/server/db/client";
import { DomainError } from "@/server/errors";
import { completeSetup } from "@/server/setup/service";

/** `values` refill the form after an error (React resets it); passwords are never sent back. */
export type SetupState = { error?: string; values?: { code: string; name: string; email: string } };

export async function setupAction(_prev: SetupState, form: FormData): Promise<SetupState> {
  const h = await headers();
  // Guessing the code is throttled like logins: ten wrong tries lock the IP for a while.
  const key = `setup-ip:${clientIp(h)}`;
  const now = new Date();
  const values = { code: String(form.get("code") ?? ""), name: String(form.get("name") ?? ""), email: String(form.get("email") ?? "") };
  if ((await lockedFor(db(), [key], now)) > 0) return { error: "Zu viele Fehlversuche. Bitte in 15 Minuten erneut versuchen.", values };
  const input = { ...values, password: String(form.get("password") ?? "") };
  if (input.password !== form.get("repeat")) return { error: "Die Passwörter stimmen nicht überein.", values };
  try {
    // The address the admin is using right now becomes the one in mail links (changeable in the settings).
    await completeSetup(db(), { ...input, baseUrl: requestOrigin(h, "http://localhost") });
  } catch (err) {
    if (!(err instanceof DomainError)) throw err;
    if (err.code === "FORBIDDEN") await recordFailure(db(), key, 10, now);
    return { error: err.message, values };
  }
  await signIn("credentials", { email: input.email, password: input.password, redirectTo: "/?settings=server" });
  return {};
}
