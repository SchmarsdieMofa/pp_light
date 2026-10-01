import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDb } from "../../src/server/db/client";
import { createUser } from "../../src/server/users/service";
import { E2E_DATABASE_URL } from "../helpers/test-env";
import { truncateAll } from "../helpers/truncate";
import { E2E_ADMIN } from "./fixtures";

export default async function globalSetup() {
  const db = createDb(E2E_DATABASE_URL);
  try {
    await migrate(db, { migrationsFolder: "src/server/db/migrations" });
    await truncateAll(db.$client);
    await createUser(db, { ...E2E_ADMIN, role: "admin" });
  } finally {
    await db.$client.end();
  }
}
