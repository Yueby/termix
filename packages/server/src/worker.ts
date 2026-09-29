import type { D1Database } from "@cloudflare/workers-types";
import { createApp } from "./app";
import { createD1Database } from "./db";
import { createWebCryptoHasher } from "./utils/crypto";

type Env = {
  DB: D1Database;
  JWT_SECRET: string;
  TURNSTILE_SECRET: string;
};

// A Worker has no startup phase, so the context is resolved per request. The missing
// secret check the Node entry point performs in main() happens here instead: jose
// rejects a zero-length key, so without it the failure surfaces as an opaque 500 on
// every authenticated request rather than naming the cause.
const app = createApp((c) => {
  const env = c.env as unknown as Env;

  if (!env.JWT_SECRET) {
    throw new Error("JWT_SECRET binding is not configured");
  }

  return {
    db: createD1Database(env.DB),
    hasher: createWebCryptoHasher(),
    jwtSecret: env.JWT_SECRET,
    turnstileSecret: env.TURNSTILE_SECRET || "",
  };
});

export default app;
