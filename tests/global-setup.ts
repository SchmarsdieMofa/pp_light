import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDb } from "../src/server/db/client";
import { TEST_DATABASE_URL } from "./helpers/test-env";

export default async function setup() {
  const db = createDb(TEST_DATABASE_URL);
  await migrate(db, { migrationsFolder: "src/server/db/migrations" });
  await db.$client.end();
}
