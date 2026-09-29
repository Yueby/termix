import { zValidator } from "@hono/zod-validator";
import { and, eq, gt } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { schema } from "../db";
import { requireAuth, REFRESH_AUDIENCE, signAccessToken, signRefreshToken, verifyToken } from "../middleware/auth";
import { verifyTurnstile } from "../middleware/turnstile";
import type { AppEnv } from "../types";
import type { HashAlgorithm, PasswordHasher } from "../utils/crypto";
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

/**
 * A password hash that never matches, used to keep the login path doing the same work
 * whether or not the account exists.
 *
 * It has to be a real hash produced by the active hasher. The previous constant,
 * `"$dummy$"`, was not: argon2 returns immediately for an unrecognised algorithm
 * identifier, so a missing account cost ~0.1 ms against ~26 ms for a real one and the
 * timing difference disclosed which usernames exist. Derived once per hasher and reused,
 * because generating it per request would reintroduce the cost it is meant to hide.
 */
const dummyHashes = new WeakMap<PasswordHasher, Promise<string>>();
function dummyHashFor(hasher: PasswordHasher): Promise<string> {
  let pending = dummyHashes.get(hasher);
  if (!pending) {
    pending = hasher.hash("termix-placeholder-for-a-user-that-does-not-exist");
    dummyHashes.set(hasher, pending);
  }
  return pending;
}

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
    // Always verify, so that an account that does not exist costs the same as one that
    // does. The hash must come from the active hasher — see dummyHashFor.
    const hashToVerify = user?.passwordHash ?? (await dummyHashFor(hasher));
    const algo = (user?.hashAlgorithm ?? hasher.algorithm) as HashAlgorithm;

    // A stored record this deployment cannot check is a different failure from a wrong
    // password. Saying so is the only way an operator discovers why an account stopped
    // being able to sign in after a move between deployments.
    let valid: boolean;
    try {
      valid = await hasher.verifyAs(password, hashToVerify, algo);
    } catch (error) {
      console.warn(`Cannot verify the stored password for ${username}: ${error}`);
      return c.json(
        { error: "This account's password cannot be verified on this deployment" },
        409,
      );
    }
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
      const { payload } = await verifyToken(refreshToken, c.var.jwtSecret, REFRESH_AUDIENCE);
      const tokenId = payload.jti as string;

      const tokenHash = await hashToken(refreshToken);

      // One statement claims the token: it has to match the id, match the stored hash and
      // still be unexpired, and the delete is what consumes it. The previous shape read the
      // row, compared it and deleted separately, so two requests presenting the same token
      // both read it and both proceeded — a stolen token could race the legitimate client
      // rather than being spent once — and the second delete's zero-row result was ignored.
      // Whoever deletes the row wins; the loser is told to authenticate again.
      const claimed = await db
        .delete(schema.refreshTokens)
        .where(
          and(
            eq(schema.refreshTokens.id, tokenId),
            eq(schema.refreshTokens.tokenHash, tokenHash),
            gt(schema.refreshTokens.expiresAt, new Date()),
          ),
        )
        .returning({ userId: schema.refreshTokens.userId });

      if (claimed.length !== 1) {
        return c.json({ error: "Invalid refresh token" }, 401);
      }

      // The stored owner, not the one in the token: the database is authoritative.
      const userId = claimed[0].userId;

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
