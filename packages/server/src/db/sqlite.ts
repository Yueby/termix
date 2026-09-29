import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Database as TermixDatabase } from "./index";
import * as schema from "./schema";

/**
 * Locates the checked-in migrations, which sit at the package root rather than beside this
 * file — and this file is `src/db/sqlite.ts` in development but `dist/server.js` in a build,
 * so the distance to that root is not fixed. Walking up a few levels covers both without
 * hard-coding either layout.
 */
function migrationsFolder(): string {
  if (process.env.MIGRATIONS_DIR) {
    return process.env.MIGRATIONS_DIR;
  }

  let dir = import.meta.dirname;
  for (let level = 0; level < 4; level++) {
    const candidate = join(dir, "drizzle");
    if (existsSync(join(candidate, "meta", "_journal.json"))) {
      return candidate;
    }
    dir = dirname(dir);
  }

  throw new Error(
    "Could not find the migrations directory. Set MIGRATIONS_DIR to the directory holding the drizzle output.",
  );
}

/**
 * Node-only factory, used by `src/server.ts`. Kept separate from `./index` because the Worker
 * imports that module and this one pulls in a native addon that cannot run there.
 */
export function createSqliteDatabase(path: string): TermixDatabase {
  const sqlite = new Database(path);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  const db = drizzle(sqlite, { schema });

  // Applied here rather than left to a separate command, because a deployment that starts
  // with no tables fails on its first sync request with an error naming neither the cause nor
  // the fix. Re-running is a no-op: applied migrations are recorded in the database.
  migrate(db, { migrationsFolder: migrationsFolder() });

  // The routes type against the awaitable D1 shape. better-sqlite3 is synchronous and `await`
  // passes its results through unchanged, so the two are interchangeable at runtime; see the
  // note on `Database` in ./index.
  return db as unknown as TermixDatabase;
}
