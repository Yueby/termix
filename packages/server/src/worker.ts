import type { D1Database } from "@cloudflare/workers-types";
import { createApp } from "./app";
import { createD1Database } from "./db";

type Env = {
  DB: D1Database;
  TERMIX_TOKEN: string;
};

// A Worker has no startup phase, so the context is resolved per request and the
// missing-token check the Node entry point performs in main() happens here instead.
const app = createApp((c) => {
  const env = c.env as unknown as Env;

  if (!env.TERMIX_TOKEN) {
    throw new Error("TERMIX_TOKEN binding is not configured");
  }

  return {
    db: createD1Database(env.DB),
    apiToken: env.TERMIX_TOKEN,
  };
});

export default app;
