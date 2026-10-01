import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { getEnv } from "@/lib/env";

const keyFor = (secret: string) => createHash("sha256").update(secret).digest();

/** Outbox bodies may contain live auth links; keep them encrypted at rest. */
export function sealMailBody(body: string, secret = getEnv().AUTH_SECRET): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFor(secret), iv);
  const ciphertext = Buffer.concat([cipher.update(body, "utf8"), cipher.final()]);
  return `v1:${iv.toString("base64url")}:${cipher.getAuthTag().toString("base64url")}:${ciphertext.toString("base64url")}`;
}

export function openMailBody(sealed: string, secret = getEnv().AUTH_SECRET): string {
  const [version, iv, tag, ciphertext] = sealed.split(":");
  if (version !== "v1" || !iv || !tag || !ciphertext) throw new Error("Ungültiger Mail-Inhalt.");
  const decipher = createDecipheriv("aes-256-gcm", keyFor(secret), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
}
