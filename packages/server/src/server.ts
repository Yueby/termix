import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { createSqliteDatabase } from "./db";
import { createArgon2Hasher } from "./utils/crypto";

const DB_PATH = process.env.DB_PATH || "./data/termix.db";
const JWT_SECRET = process.env.JWT_SECRET;
const TURNSTILE_SECRET = process.env.TURNSTILE_SECRET || "";
const PORT = parseInt(process.env.PORT || "3000", 10);

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable is required");
}

async function main() {
  const db = createSqliteDatabase(DB_PATH);
  const hasher = await createArgon2Hasher();
  const corsOrigins = process.env.CORS_ORIGIN?.split(",").map((s) => s.trim());
  const app = createApp(corsOrigins);

  app.use("*", async (c, next) => {
    c.set("db", db);
    c.set("hasher", hasher);
    c.set("jwtSecret", JWT_SECRET);
    c.set("turnstileSecret", TURNSTILE_SECRET);
    await next();
  });

  console.log(`Termix Server listening on http://localhost:${PORT}`);
  serve({ fetch: app.fetch, port: PORT });
}

main().catch(console.error);
