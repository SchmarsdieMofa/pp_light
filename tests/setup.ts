import { afterAll } from "vitest";
import { testDb } from "./helpers/db";

afterAll(async () => {
  await testDb.$client.end();
});
