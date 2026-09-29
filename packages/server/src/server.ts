import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { createSqliteDatabase } from "./db/sqlite";
import { createArgon2Hasher } from "./utils/crypto";

const DB_PATH = process.env.DB_PATH || "./data/termix.db";
const TURNSTILE_SECRET = process.env.TURNSTILE_SECRET || "";
const PORT = parseInt(process.env.PORT || "3000", 10);

async function main() {
  // Read and validate inside main() so the value stays narrowed to `string` at the point
  // of use; a module-scope guard does not carry into a function body.
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    throw new Error("JWT_SECRET environment variable is required");
  }

  const db = createSqliteDatabase(DB_PATH);
  const hasher = await createArgon2Hasher();
  const corsOrigins = process.env.CORS_ORIGIN?.split(",").map((s) => s.trim());

  const app = createApp(
    () => ({ db, hasher, jwtSecret, turnstileSecret: TURNSTILE_SECRET }),
    corsOrigins,
  );

  console.log(`Termix Server listening on http://localhost:${PORT}`);
  serve({ fetch: app.fetch, port: PORT });
}

main().catch((err) => {
  // Exit non-zero: a server that refused to start because it is misconfigured must not
  // look like a successful run to a supervisor or a container runtime.
  console.error(err);
  process.exit(1);
});
