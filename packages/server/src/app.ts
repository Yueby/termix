import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";
import { authRoutes } from "./routes/auth";
import { deviceRoutes } from "./routes/devices";
import { keysRoutes } from "./routes/keys";
import { syncRoutes } from "./routes/sync";
import type { AppEnv } from "./types";

export function createApp(corsOrigins?: string[]) {
  const app = new Hono<AppEnv>();

  app.use("*", secureHeaders());
  app.use("*", cors({
    origin: corsOrigins ?? ["*"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  }));
  app.use("*", logger());

  app.get("/health", (c) => c.json({ status: "ok" }));

  app.route("/auth", authRoutes);
  app.route("/devices", deviceRoutes);
  app.route("/keys", keysRoutes);
  app.route("/sync", syncRoutes);

  return app;
}
