import type { D1Database } from "@cloudflare/workers-types";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { drizzle as drizzleD1 } from "drizzle-orm/d1";
import * as schema from "./schema";

/**
 * The shape the routes are written against.
 *
 * Two runtimes are supported: Cloudflare D1 when deployed, and better-sqlite3 for
 * self-hosted Node. The routes are typed against the D1 shape because it is the
 * awaitable one, and awaiting is what both satisfy — D1 returns promises, while
 * better-sqlite3 returns results synchronously and `await` passes them through
 * unchanged. So every query must be awaited, even where the Node driver could be read
 * directly, and anything the two drivers do not share (transactions, batch) must not
 * be used through this type.
 *
 * The Node factory lives in `./sqlite`. It is kept out of this module because the
 * Worker imports this one and `better-sqlite3` is a native Node addon.
 */
export type Database = DrizzleD1Database<typeof schema>;

export function createD1Database(d1: D1Database): Database {
  return drizzleD1(d1, { schema });
}

export { schema };
