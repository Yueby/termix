import { Hono } from "hono";
import type { Context } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";
import type { Database } from "./db";
import { syncRoutes } from "./routes/sync";
import type { AppEnv } from "./types";

/**
 * Everything the routes read out of the request context. The entry points resolve these;
 * `createApp` only wires them up.
 */
export interface AppContext {
  db: Database;
  apiToken: string;
}

/**
 * Resolves the context for one request. Node builds it once and returns it every time; a
 * Worker has no startup phase, so it derives everything from `c.env` per request.
 */
export type AppContextResolver = (c: Context) => AppContext | Promise<AppContext>;

export function createApp(resolveContext: AppContextResolver, corsOrigins?: string[]) {
  const app = new Hono<AppEnv>();

  // This must be registered before the routes below. Hono composes handlers in registration
  // order, so a wildcard middleware added after `app.route(...)` never runs for the mounted
  // handlers. That failure is quiet rather than loud: requests are still routed and
  // answered, they just answer from an empty context.
  app.use("*", async (c, next) => {
    const context = await resolveContext(c);
    c.set("db", context.db);
    c.set("apiToken", context.apiToken);
    await next();
  });

  app.use("*", secureHeaders());
  app.use(
    "*",
    cors({
      origin: corsOrigins ?? ["*"],
      allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization"],
    }),
  );
  app.use("*", logger());

  // Unauthenticated on purpose: a deployment check that needs a credential cannot tell
  // "the server is up" from "the token is wrong".
  app.get("/health", (c) => c.json({ status: "ok" }));

  app.route("/sync", syncRoutes);

  return app;
}
