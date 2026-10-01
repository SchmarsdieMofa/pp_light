import { migrate } from "drizzle-orm/node-postgres/migrator";
import { parseEnv } from "../src/lib/env";
import { createDb } from "../src/server/db/client";

async function main() {
  // Runs first in the container entrypoint: an invalid config stops the start here, naming the variable.
  let url: string;
  try {
    url = parseEnv(process.env).DATABASE_URL;
  } catch (err) {
    console.error((err as Error).message);
    process.exit(1);
  }
  const db = createDb(url);
  try {
    await migrate(db, { migrationsFolder: process.env.MIGRATIONS_DIR ?? "src/server/db/migrations" });
    console.log("Migrationen ausgeführt");
  } finally {
    await db.$client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
