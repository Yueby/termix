import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { createSqliteDatabase } from "./db/sqlite";

const DB_PATH = process.env.DB_PATH || "./data/termix.db";
const PORT = parseInt(process.env.PORT || "3000", 10);

async function main() {
  // Read and validate inside main() so the value stays narrowed to `string` at the point of
  // use; a module-scope guard does not carry into a function body.
  const apiToken = process.env.TERMIX_TOKEN;
  if (!apiToken) {
    throw new Error(
      "TERMIX_TOKEN is required. Generate one with `openssl rand -hex 32` and put it in both this deployment and the client.",
    );
  }
  if (apiToken.length < 16) {
    throw new Error(
      "TERMIX_TOKEN is too short to be a secret. Generate one with `openssl rand -hex 32`.",
    );
  }

  const db = createSqliteDatabase(DB_PATH);
  const corsOrigins = process.env.CORS_ORIGIN?.split(",").map((s) => s.trim());

  const app = createApp(() => ({ db, apiToken }), corsOrigins);

  console.log(`Termix Server listening on http://localhost:${PORT}`);
  serve({ fetch: app.fetch, port: PORT });
}

main().catch((err) => {
  // Exit non-zero: a server that refused to start because it is misconfigured must not look
  // like a successful run to a supervisor or a container runtime.
  console.error(err);
  process.exit(1);
});
