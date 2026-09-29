import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../types";
import { timingSafeEqual } from "../utils/crypto";

/**
 * Guards every route behind one shared token.
 *
 * A private deployment has a single operator, so there is nothing for an account system to
 * tell apart — and a password hash is the wrong thing to spend on a Worker, where the free
 * plan allows 10 ms of CPU per request and Cloudflare's own documentation puts
 * authentication at 10-20 ms.
 *
 * An unconfigured token is refused rather than read as "no auth" — that distinction is the
 * difference between a closed vault and an open one.
 */
export const requireToken = createMiddleware<AppEnv>(async (c, next) => {
  const configured = c.var.apiToken;
  if (!configured) {
    return c.json({ error: "Server token is not configured" }, 500);
  }

  const header = c.req.header("Authorization");
  const presented = header?.startsWith("Bearer ") ? header.slice(7) : "";

  if (!presented || !timingSafeEqual(presented, configured)) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  await next();
});
