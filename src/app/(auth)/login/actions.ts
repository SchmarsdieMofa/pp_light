"use server";

import { AuthError } from "next-auth";
import { LoginLockedError, signIn } from "@/auth";

export type LoginState = { error?: string };

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: "/",
    });
    return {};
  } catch (err) {
    if (err instanceof LoginLockedError || (err instanceof AuthError && (err as { code?: string }).code === "locked")) {
      return { error: "Zu viele Fehlversuche. Bitte in 15 Minuten erneut versuchen." };
    }
    if (err instanceof AuthError) return { error: "E-Mail oder Passwort ist falsch." };
    throw err; // NEXT_REDIRECT on success must propagate
  }
}
