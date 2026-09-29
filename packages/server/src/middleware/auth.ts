import { createMiddleware } from "hono/factory";
import * as jose from "jose";
import type { AppEnv } from "../types";

export const JWT_ALG = "HS256";
export const ACCESS_TOKEN_TTL = "15m";
export const REFRESH_TOKEN_TTL = "30d";

/**
 * Access and refresh tokens are signed with the same key, so the only thing that tells
 * them apart is the audience. Without it a refresh token is accepted anywhere an access
 * token is, which quietly turns a 30-day credential into a bearer token that logout and
 * rotation cannot revoke.
 */
export const ACCESS_AUDIENCE = "termix:access";
export const REFRESH_AUDIENCE = "termix:refresh";

export async function signAccessToken(userId: string, secret: string): Promise<string> {
  const key = new TextEncoder().encode(secret);
  return new jose.SignJWT({ sub: userId })
    .setProtectedHeader({ alg: JWT_ALG })
    .setAudience(ACCESS_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(ACCESS_TOKEN_TTL)
    .sign(key);
}

export async function signRefreshToken(
  userId: string,
  tokenId: string,
  secret: string,
): Promise<string> {
  const key = new TextEncoder().encode(secret);
  return new jose.SignJWT({ sub: userId, jti: tokenId })
    .setProtectedHeader({ alg: JWT_ALG })
    .setAudience(REFRESH_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(REFRESH_TOKEN_TTL)
    .sign(key);
}

/**
 * Verifies a token and pins both the algorithm and the audience. Pinning the algorithm
 * keeps a token signed with anything but HS256 from being considered, and pinning the
 * audience is what separates the two token kinds.
 *
 * Tokens issued before the audience was added will no longer verify; that is the point —
 * the refresh-token-as-access-token path is exactly what has to stop working.
 */
export async function verifyToken(token: string, secret: string, audience: string) {
  const key = new TextEncoder().encode(secret);
  return jose.jwtVerify(token, key, { audience, algorithms: [JWT_ALG] });
}

export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const header = c.req.header("Authorization");
  if (!header?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const token = header.slice(7);
  try {
    const { payload } = await verifyToken(token, c.var.jwtSecret, ACCESS_AUDIENCE);
    if (typeof payload.sub !== "string") {
      return c.json({ error: "Invalid token payload" }, 401);
    }
    c.set("userId", payload.sub);
    await next();
  } catch {
    return c.json({ error: "Invalid or expired token" }, 401);
  }
});
