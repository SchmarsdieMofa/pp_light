import { sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

/** Fractional-index keys must be compared bytewise, independent of DB collation. */
export function byPosition(column: AnyPgColumn): SQL {
  return sql`${column} collate "C"`;
}

/** Natural order of task paths: 1, 1.1, 1.2, 1.10, 2 (not "1", "1.10", "1.2"). */
export function byPath(column: AnyPgColumn): SQL {
  return sql`string_to_array(${column}, '.')::int[]`;
}
