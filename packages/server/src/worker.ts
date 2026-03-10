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
  c.set("db", createD1Database(env.DB));
  c.set("hasher", createWebCryptoHasher());
  c.set("jwtSecret", env.JWT_SECRET);
  c.set("turnstileSecret", env.TURNSTILE_SECRET || "");
  await next();
});

export default app;
