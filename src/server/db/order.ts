import { sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

/** Fractional-index keys must be compared bytewise, independent of DB collation. */
export function byPosition(column: AnyPgColumn): SQL {
  return sql`${column} collate "C"`;
}
