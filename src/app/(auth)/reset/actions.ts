"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { clientIp } from "@/server/auth/credentials";
import { lockedFor, recordFailure } from "@/server/auth/throttle";
import { db } from "@/server/db/client";
import { DomainError } from "@/server/errors";
import { consumeAuthToken, requestPasswordReset } from "@/server/users/invitations";

export type AuthFormState = { error?: string; done?: boolean };

export async function requestResetAction(_prev: AuthFormState, form: FormData): Promise<AuthFormState> {
  // Same answer either way (no enumeration); an IP that floods reset requests is silently ignored.
  const key = `reset-ip:${clientIp(await headers())}`;
  const now = new Date();
  if ((await lockedFor(db(), [key], now)) === 0) {
    await recordFailure(db(), key, 10, now);
    await requestPasswordReset(db(), String(form.get("email") ?? ""));
  }
  return { done: true };
}

export async function setPasswordAction(kind: "invite" | "reset", token: string, _prev: AuthFormState, form: FormData): Promise<AuthFormState> {
  const password = String(form.get("password") ?? "");
  if (password !== form.get("repeat")) return { error: "Die Passwörter stimmen nicht überein." };
  try { await consumeAuthToken(db(), token, kind, password); }
  catch (error) {
    if (!(error instanceof DomainError)) throw error;
    return { error: "Der Link ist ungültig oder abgelaufen, oder das Passwort ist zu kurz (mindestens zwölf Zeichen)." };
  }
  redirect("/login?password=ready");
}
