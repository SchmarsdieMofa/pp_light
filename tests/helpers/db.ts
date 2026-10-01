import { createDb } from "@/server/db/client";
import { TEST_DATABASE_URL } from "./test-env";
import { truncateAll } from "./truncate";

export const testDb = createDb(TEST_DATABASE_URL);

export function resetDb(): Promise<void> {
  return truncateAll(testDb.$client);
}
