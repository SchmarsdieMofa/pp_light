import { eq } from "drizzle-orm";
import type { Executor } from "@/server/db/client";
import { appSettings } from "@/server/db/schema";
import { DomainError } from "@/server/errors";
import { assertCan, type Actor } from "@/server/permissions";

export type AppSettings = { httpsOnly: boolean; baseUrl: string | null };

export async function getAppSettings(db: Executor): Promise<AppSettings> {
  const [row] = await db
    .select({ httpsOnly: appSettings.httpsOnly, baseUrl: appSettings.baseUrl })
    .from(appSettings)
    .where(eq(appSettings.id, 1));
  return row ?? { httpsOnly: false, baseUrl: null };
}

/** Writes some settings, creating the single row on first use. */
export async function saveAppSettings(db: Executor, values: Partial<typeof appSettings.$inferInsert>): Promise<void> {
  await db.insert(appSettings).values({ id: 1, ...values }).onConflictDoUpdate({ target: appSettings.id, set: values });
}

/** Address for links in mails: the stored one, else APP_URL, else localhost. No trailing slash. */
export async function getBaseUrl(db: Executor): Promise<string> {
  const { baseUrl } = await getAppSettings(db);
  return (baseUrl ?? process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

/** `http(s)://host[:port]` only – no path, no credentials. */
export function normalizeBaseUrl(raw: string): string {
  const invalid = () => new DomainError("VALIDATION", "Bitte eine Adresse wie https://pp.firma.local angeben.");
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw invalid();
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw invalid();
  }
  return url.origin;
}

export async function setBaseUrl(db: Executor, actor: Actor, raw: string): Promise<void> {
  assertCan(actor, "admin.manageUsers");
  await saveAppSettings(db, { baseUrl: normalizeBaseUrl(raw) });
}

/**
 * HTTPS-only can only be switched on from a request that arrived over HTTPS – that proves HTTPS reaches the app.
 * Behind a proxy that forwards plain HTTP the app always sees "http", so the redirect loop cannot be switched on.
 */
export async function setHttpsOnly(db: Executor, actor: Actor, on: boolean, currentProto: "http" | "https"): Promise<void> {
  assertCan(actor, "admin.manageUsers");
  if (on && currentProto !== "https") {
    throw new DomainError(
      "VALIDATION",
      "„Nur HTTPS“ lässt sich nur einschalten, wenn du pp_light gerade über HTTPS geöffnet hast.",
    );
  }
  await saveAppSettings(db, { httpsOnly: on });
}
