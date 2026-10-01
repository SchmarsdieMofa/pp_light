import { drizzle, type NodePgQueryResultHKT } from "drizzle-orm/node-postgres";
import type { PgDatabase } from "drizzle-orm/pg-core";
import { Pool } from "pg";
import { getEnv } from "@/lib/env";
import * as schema from "./schema";

export function createDb(url: string) {
  const pool = new Pool({ connectionString: url });
  return drizzle({ client: pool, schema });
}

export type DB = ReturnType<typeof createDb>;

/** A DB handle or an open transaction – for helpers that must run inside a caller's transaction. */
export type Executor = PgDatabase<NodePgQueryResultHKT, typeof schema>;

let instance: DB | undefined;

export function db(): DB {
  instance ??= createDb(getEnv().DATABASE_URL);
  return instance;
}
