import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  hashAlgorithm: text("hash_algorithm").notNull().default("argon2"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const devices = sqliteTable("devices", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  platform: text("platform").notNull(),
  publicKey: text("public_key").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
}, (table) => [
  index("devices_user_id_idx").on(table.userId),
]);

export const refreshTokens = sqliteTable("refresh_tokens", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
}, (table) => [
  index("refresh_tokens_user_id_idx").on(table.userId),
  index("refresh_tokens_expires_at_idx").on(table.expiresAt),
]);

export const syncData = sqliteTable("sync_data", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  data: text("data").notNull(),
  version: integer("version").notNull().default(1),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});
