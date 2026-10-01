import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { getEnv } from "@/lib/env";
import * as schema from "./schema";

export function createDb(url: string) {
  const pool = new Pool({ connectionString: url });
  return drizzle({ client: pool, schema });
}

export type DB = ReturnType<typeof createDb>;

let instance: DB | undefined;

export function db(): DB {
  instance ??= createDb(getEnv().DATABASE_URL);
  return instance;
}
