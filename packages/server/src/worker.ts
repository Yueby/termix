import type { D1Database } from "@cloudflare/workers-types";
import { createApp } from "./app";
import { createD1Database } from "./db";
import { createWebCryptoHasher } from "./utils/crypto";

type Env = {
  DB: D1Database;
  JWT_SECRET: string;
  TURNSTILE_SECRET: string;
};

const app = createApp();

app.use("*", async (c, next) => {
  const env = c.env as unknown as Env;

  // A Worker has no startup phase, so the missing-secret check the Node entry point
  // performs in main() happens per request here. It has to be explicit: jose rejects a
  // zero-length key, so without this the failure surfaces as an opaque 500 on every
  // authenticated request instead of naming the cause.
  if (!env.JWT_SECRET) {
    throw new Error("JWT_SECRET binding is not configured");
  }

  c.set("db", createD1Database(env.DB));
  c.set("hasher", createWebCryptoHasher());
  c.set("jwtSecret", env.JWT_SECRET);
  c.set("turnstileSecret", env.TURNSTILE_SECRET || "");
  await next();
});

export default app;
