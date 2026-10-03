import { createDb } from "../src/server/db/client";
import { issueSetupCode } from "../src/server/setup/service";

/** Runs at container start: on a fresh install prints a new setup code for /setup, otherwise nothing. */
async function main() {
  const db = createDb(process.env.DATABASE_URL!);
  try {
    const code = await issueSetupCode(db);
    if (code) {
      console.log(
        ["", "  pp_light ist noch nicht eingerichtet.", `  Einrichtungscode: ${code}`, "  Im Browser öffnen und den Admin anlegen: /setup", ""].join("\n"),
      );
    }
  } finally {
    await db.$client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
