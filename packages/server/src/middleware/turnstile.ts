import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../types";

interface TurnstileResponse {
  success: boolean;
  "error-codes"?: string[];
}

let warnedMissingSecret = false;

export const verifyTurnstile = createMiddleware<AppEnv>(async (c, next) => {
  const secret = c.var.turnstileSecret;
  if (!secret) {
    // CAPTCHA is opt-in: no secret means it is switched off. Say so once, because
    // silently skipping bot protection is the kind of thing that is only noticed after
    // it matters.
    if (!warnedMissingSecret) {
      warnedMissingSecret = true;
      console.warn(
        "TURNSTILE_SECRET is not set — CAPTCHA verification is disabled for register and login.",
      );
    }
    await next();
    return;
  }

  const body = (await c.req.raw
    .clone()
    .json()
    .catch(() => ({}))) as { turnstileToken?: string };
  const token = body.turnstileToken;
  if (!token) {
    return c.json({ error: "CAPTCHA token required" }, 400);
  }

  let result: TurnstileResponse;
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret, response: token }),
    });
    // Fail closed. If the verification service is unreachable or answers with an error
    // we cannot claim the token was valid, and treating that as a pass would turn an
    // outage into an open door.
    if (!res.ok) {
      return c.json({ error: "CAPTCHA verification failed" }, 403);
    }
    result = (await res.json()) as TurnstileResponse;
  } catch {
    return c.json({ error: "CAPTCHA verification failed" }, 403);
  }

  if (!result.success) {
    return c.json({ error: "CAPTCHA verification failed" }, 403);
  }

  await next();
});
