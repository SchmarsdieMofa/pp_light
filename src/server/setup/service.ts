import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { sql } from "drizzle-orm";
import { z } from "zod";
import type { DB, Executor } from "@/server/db/client";
import { appSettings, users } from "@/server/db/schema";
import { DomainError } from "@/server/errors";
import { getAppSettings, saveAppSettings } from "@/server/settings/service";
import { createUser, type User } from "@/server/users/service";

/** No 0/O, 1/I/L – the code is read from a log and typed in. */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
/** Serializes setups; any constant works as long as nothing else uses it. */
const SETUP_LOCK = 7_310_001;

const normalizeCode = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, "");
const hashCode = (code: string) => createHash("sha256").update(normalizeCode(code)).digest("hex");

export function newSetupCode(): string {
  const chars = Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)]);
  return `${chars.slice(0, 4).join("")}-${chars.slice(4).join("")}`;
}

export async function hasUsers(db: Executor): Promise<boolean> {
  const [row] = await db.select({ id: users.id }).from(users).limit(1);
  return Boolean(row);
}

/** A fresh setup code while nobody has set the instance up (the old one stops working), else null. */
export async function issueSetupCode(db: DB): Promise<string | null> {
  if (await hasUsers(db)) return null;
  const code = newSetupCode();
  await saveAppSettings(db, { setupCodeHash: hashCode(code) });
  return code;
}

export async function hasSetupCode(db: DB): Promise<boolean> {
  const [row] = await db.select({ hash: appSettings.setupCodeHash }).from(appSettings).limit(1);
  return Boolean(row?.hash);
}

const setupSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.email(),
  password: z.string().min(12).max(200),
});

/** Creates the first admin. Needs the setup code from the server log; runs once. */
export async function completeSetup(
  db: DB,
  input: { code: string; name: string; email: string; password: string; baseUrl: string },
): Promise<User> {
  const parsed = setupSchema.safeParse({ ...input, email: input.email.trim().toLowerCase() });
  if (!parsed.success) {
    throw new DomainError("VALIDATION", "Name, eine gültige E-Mail und ein Passwort mit mindestens 12 Zeichen sind nötig.");
  }
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${SETUP_LOCK})`);
    if (await hasUsers(tx)) throw new DomainError("CONFLICT", "pp_light ist bereits eingerichtet.");
    const [row] = await tx.select({ hash: appSettings.setupCodeHash }).from(appSettings).limit(1);
    const given = Buffer.from(hashCode(input.code), "hex");
    if (!row?.hash || !timingSafeEqual(Buffer.from(row.hash, "hex"), given)) {
      throw new DomainError("FORBIDDEN", "Der Einrichtungscode stimmt nicht. Den aktuellen zeigt: docker compose logs app");
    }
    const user = await createUser(tx, { ...parsed.data, role: "admin" });
    await saveAppSettings(tx, { setupCodeHash: null, baseUrl: (await getAppSettings(tx)).baseUrl ?? input.baseUrl });
    return user;
  });
}
