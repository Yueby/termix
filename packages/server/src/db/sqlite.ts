import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import type { Database as TermixDatabase } from "./index";
import * as schema from "./schema";

/**
 * Node-only factory, used by `src/server.ts`. Kept separate from `./index` because the
 * Worker imports that module and this one pulls in a native addon that cannot run
 * there.
 */
export function createSqliteDatabase(path: string): TermixDatabase {
  const sqlite = new Database(path);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  // The routes type against the awaitable D1 shape. better-sqlite3 is synchronous and
  // `await` passes its results through unchanged, so the two are interchangeable at
  // runtime; see the note on `Database` in ./index.
  return drizzle(sqlite, { schema }) as unknown as TermixDatabase;
}
