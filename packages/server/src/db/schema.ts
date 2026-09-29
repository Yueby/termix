import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * One vault per deployment.
 *
 * A private Termix server belongs to one person, so there is no second account to keep data
 * apart from and no owner column. The row is addressed by a fixed id instead.
 */
export const syncData = sqliteTable("sync_data", {
  id: text("id").primaryKey(),
  data: text("data").notNull(),
  version: integer("version").notNull().default(1),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});
