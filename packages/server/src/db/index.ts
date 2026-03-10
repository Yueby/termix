import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { drizzle as drizzleSqlite } from "drizzle-orm/better-sqlite3";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { drizzle as drizzleD1 } from "drizzle-orm/d1";
import * as schema from "./schema";

export type Database =
  | BetterSQLite3Database<typeof schema>
  | DrizzleD1Database<typeof schema>;

export function createD1Database(d1: D1Database): DrizzleD1Database<typeof schema> {
  return drizzleD1(d1, { schema });
}

export function createSqliteDatabase(path: string): BetterSQLite3Database<typeof schema> {
  // Dynamic import to avoid bundling in CF Workers
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Database = require("better-sqlite3");
  const sqlite = new Database(path);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  return drizzleSqlite(sqlite, { schema });
}

export { schema };
