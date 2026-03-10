import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { schema } from "../db";
import { requireAuth, signAccessToken, signRefreshToken, verifyToken } from "../middleware/auth";
import { verifyTurnstile } from "../middleware/turnstile";
import type { AppEnv } from "../types";
import { verifyWithAlgorithm, type HashAlgorithm } from "../utils/crypto";
import { generateId } from "../utils/id";

const REFRESH_TOKEN_DAYS = 30;
const REFRESH_TOKEN_MS = REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000;

const registerSchema = z.object({
  username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_-]+$/),
  password: z.string().min(8).max(128),
  turnstileToken: z.string().optional(),
});

const loginSchema = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(128),
  turnstileToken: z.string().optional(),
});

const refreshSchema = z.object({
  refreshToken: z.string(),
});

export const authRoutes = new Hono<AppEnv>()
  .post("/register", verifyTurnstile, zValidator("json", registerSchema), async (c) => {
    const { username, password } = c.req.valid("json");
    const db = c.var.db;
    const hasher = c.var.hasher;

    const existing = await db.select().from(schema.users).where(eq(schema.users.username, username)).get();
    if (existing) {
      return c.json({ error: "Username already taken" }, 409);
    }

    const userId = generateId();
    const passwordHash = await hasher.hash(password);

    await db.insert(schema.users).values({
      id: userId,
      username,
      passwordHash,
      hashAlgorithm: hasher.algorithm,
      createdAt: new Date(),
    });

    const tokenId = generateId();
    const [accessToken, refreshToken] = await Promise.all([
      signAccessToken(userId, c.var.jwtSecret),
      signRefreshToken(userId, tokenId, c.var.jwtSecret),
    ]);

    const tokenHash = await hashToken(refreshToken);
    await db.insert(schema.refreshTokens).values({
      id: tokenId,
      userId,
      tokenHash,
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_MS),
      createdAt: new Date(),
    });

    return c.json({ accessToken, refreshToken, userId, username });
  })

  .post("/login", verifyTurnstile, zValidator("json", loginSchema), async (c) => {
    const { username, password } = c.req.valid("json");
    const db = c.var.db;
    const hasher = c.var.hasher;

    const user = await db.select().from(schema.users).where(eq(schema.users.username, username)).get();
    // Constant-time: always run verify even if user doesn't exist
    const hashToVerify = user?.passwordHash ?? "$dummy$";
    const algo = (user?.hashAlgorithm ?? hasher.algorithm) as HashAlgorithm;
    const valid = await verifyWithAlgorithm(password, hashToVerify, algo);
    if (!user || !valid) {
      return c.json({ error: "Invalid credentials" }, 401);
    }

    const tokenId = generateId();
    const [accessToken, refreshToken] = await Promise.all([
      signAccessToken(user.id, c.var.jwtSecret),
      signRefreshToken(user.id, tokenId, c.var.jwtSecret),
    ]);

    const tokenHash = await hashToken(refreshToken);
    await db.insert(schema.refreshTokens).values({
      id: tokenId,
      userId: user.id,
      tokenHash,
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_MS),
      createdAt: new Date(),
    });

    return c.json({ accessToken, refreshToken, userId: user.id, username: user.username });
  })

  .post("/refresh", zValidator("json", refreshSchema), async (c) => {
    const { refreshToken } = c.req.valid("json");
    const db = c.var.db;

    try {
      const { payload } = await verifyToken(refreshToken, c.var.jwtSecret);
      const tokenId = payload.jti as string;
      const userId = payload.sub as string;

      const stored = await db.select().from(schema.refreshTokens).where(eq(schema.refreshTokens.id, tokenId)).get();
      if (!stored || stored.expiresAt < new Date()) {
        return c.json({ error: "Invalid refresh token" }, 401);
      }

      const tokenHash = await hashToken(refreshToken);
      if (stored.tokenHash !== tokenHash) {
        return c.json({ error: "Invalid refresh token" }, 401);
      }

      // Rotate: delete old, create new
      await db.delete(schema.refreshTokens).where(eq(schema.refreshTokens.id, tokenId));

      const newTokenId = generateId();
      const [accessToken, newRefreshToken] = await Promise.all([
        signAccessToken(userId, c.var.jwtSecret),
        signRefreshToken(userId, newTokenId, c.var.jwtSecret),
      ]);

      const newTokenHash = await hashToken(newRefreshToken);
      await db.insert(schema.refreshTokens).values({
        id: newTokenId,
        userId,
        tokenHash: newTokenHash,
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_MS),
        createdAt: new Date(),
      });

      return c.json({ accessToken, refreshToken: newRefreshToken });
    } catch {
      return c.json({ error: "Invalid refresh token" }, 401);
    }
  })

  .post("/logout", requireAuth, async (c) => {
    const db = c.var.db;
    const userId = c.var.userId;
    await db.delete(schema.refreshTokens).where(eq(schema.refreshTokens.userId, userId));
    return c.json({ ok: true });
  });

async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
