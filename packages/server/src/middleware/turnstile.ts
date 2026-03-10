import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../types";

interface TurnstileResponse {
  success: boolean;
  "error-codes"?: string[];
}

export const verifyTurnstile = createMiddleware<AppEnv>(async (c, next) => {
  const secret = c.var.turnstileSecret;
  if (!secret) {
    await next();
    return;
  }

  const body = await c.req.raw.clone().json().catch(() => ({}));
  const token = body?.turnstileToken;
  if (!token) {
    return c.json({ error: "CAPTCHA token required" }, 400);
  }

  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ secret, response: token }),
  });

  const result: TurnstileResponse = await res.json();
  if (!result.success) {
    return c.json({ error: "CAPTCHA verification failed" }, 403);
  }

  await next();
});
