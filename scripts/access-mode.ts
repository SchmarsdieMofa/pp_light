import { createDb } from "../src/server/db/client";
import { getAppSettings, saveAppSettings } from "../src/server/settings/service";

/**
 * Way out when „Nur HTTPS“ locks everyone out (e.g. a proxy in front was switched to plain HTTP later):
 *   docker compose exec app node scripts/access-mode.mjs http
 */
async function main() {
  const mode = process.argv[2];
  const db = createDb(process.env.DATABASE_URL!);
  try {
    if (mode === "http" || mode === "https") await saveAppSettings(db, { httpsOnly: mode === "https" });
    else if (mode) {
      console.error("Aufruf: access-mode [http|https]");
      process.exitCode = 1;
      return;
    }
    const { httpsOnly } = await getAppSettings(db);
    console.log(httpsOnly ? "Zugriff: nur HTTPS (HTTP wird umgeleitet)" : "Zugriff: HTTP und HTTPS");
  } finally {
    await db.$client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
