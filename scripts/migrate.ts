import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDb } from "../src/server/db/client";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL fehlt");
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
