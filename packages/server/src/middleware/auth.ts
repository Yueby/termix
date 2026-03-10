import { createMiddleware } from "hono/factory";
import * as jose from "jose";
import type { AppEnv } from "../types";

export const JWT_ALG = "HS256";
export const ACCESS_TOKEN_TTL = "15m";
export const REFRESH_TOKEN_TTL = "30d";

export async function signAccessToken(userId: string, secret: string): Promise<string> {
  const key = new TextEncoder().encode(secret);
  return new jose.SignJWT({ sub: userId })
    .setProtectedHeader({ alg: JWT_ALG })
    .setIssuedAt()
    .setExpirationTime(ACCESS_TOKEN_TTL)
    .sign(key);
}

export async function signRefreshToken(userId: string, tokenId: string, secret: string): Promise<string> {
  const key = new TextEncoder().encode(secret);
  return new jose.SignJWT({ sub: userId, jti: tokenId })
    .setProtectedHeader({ alg: JWT_ALG })
    .setIssuedAt()
    .setExpirationTime(REFRESH_TOKEN_TTL)
    .sign(key);
}

export async function verifyToken(token: string, secret: string) {
  const key = new TextEncoder().encode(secret);
  return jose.jwtVerify(token, key);
}

export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const header = c.req.header("Authorization");
  if (!header?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const token = header.slice(7);
  try {
    const { payload } = await verifyToken(token, c.var.jwtSecret);
    if (typeof payload.sub !== "string") {
      return c.json({ error: "Invalid token payload" }, 401);
    }
    c.set("userId", payload.sub);
    await next();
  } catch {
    return c.json({ error: "Invalid or expired token" }, 401);
  }
});
