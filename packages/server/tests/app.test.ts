import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AppContext } from "../src/app";
import { createApp } from "../src/app";
import { createSqliteDatabase } from "../src/db/sqlite";
import { createWebCryptoHasher } from "../src/utils/crypto";

/**
 * Written out here rather than migrated in, because the package ships no migration files —
 * which is an open finding, and the reason a fresh deployment has no tables at all.
 * Kept in step with src/db/schema.ts by hand for now.
 */
const SCHEMA = `
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  hash_algorithm TEXT NOT NULL DEFAULT 'argon2',
  created_at INTEGER NOT NULL
);
CREATE TABLE devices (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  platform TEXT NOT NULL,
  public_key TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX devices_user_id_idx ON devices(user_id);
CREATE TABLE refresh_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX refresh_tokens_user_id_idx ON refresh_tokens(user_id);
CREATE TABLE sync_data (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  data TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL
);
`;

let app: ReturnType<typeof createApp>;
let dbPath: string;

beforeEach(() => {
  dbPath = join(tmpdir(), `termix-test-${randomUUID()}.db`);
  const raw = new Database(dbPath);
  raw.exec(SCHEMA);
  raw.close();

  const context: AppContext = {
    db: createSqliteDatabase(dbPath),
    // PBKDF2 rather than argon2: this is the hasher the Worker uses, it has no native
    // dependency, and password strength is not what these tests are about.
    hasher: createWebCryptoHasher(),
    jwtSecret: "test-secret-not-used-outside-these-tests",
    turnstileSecret: "",
  };
  app = createApp(() => context);
});

afterEach(async () => {
  const { unlink } = await import("node:fs/promises");
  await unlink(dbPath).catch(() => {});
});

function register(username: string) {
  return app.request("/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password: "correct horse battery" }),
  });
}

async function registerAndGetTokens(username: string) {
  const res = await register(username);
  expect(res.status).toBe(200);
  return (await res.json()) as { accessToken: string; refreshToken: string; userId: string };
}

function authed(path: string, token: string, init: RequestInit = {}) {
  return app.request(path, {
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${token}` },
  });
}

describe("app assembly", () => {
  it("reaches the database, so the context middleware runs before the routes", async () => {
    // Registration touches the database, the hasher and the signing key. It can only
    // succeed if all three arrived in the request context — which is exactly what did not
    // happen when the context middleware was registered after the routes: every request
    // was routed and answered from an empty context.
    const res = await register("someone");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ username: "someone" });
  });

  it("serves health without a database", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
  });
});

describe("token kinds", () => {
  it("refuses a refresh token used as an access token", async () => {
    const { refreshToken } = await registerAndGetTokens("alice");
    const res = await authed("/devices", refreshToken);
    expect(res.status).toBe(401);
  });

  it("accepts the access token it just issued", async () => {
    const { accessToken } = await registerAndGetTokens("bob");
    const res = await authed("/devices", accessToken);
    expect(res.status).toBe(200);
  });

  it("refuses a garbage bearer token", async () => {
    const res = await authed("/devices", "not-a-token");
    expect(res.status).toBe(401);
  });
});

describe("sync pushes", () => {
  it("accepts a newer version and refuses an older one", async () => {
    const { accessToken } = await registerAndGetTokens("carol");

    const first = await authed("/sync/push", accessToken, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: "v2", version: 2 }),
    });
    expect(first.status).toBe(200);

    const stale = await authed("/sync/push", accessToken, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: "stale", version: 1 }),
    });
    expect(stale.status).toBe(409);

    // A rejected push must not have written anything: this is the regression the read-
    // then-write version check allowed, where a slower request carrying an older version
    // could land last and overwrite newer data while both requests reported success.
    const pull = await authed("/sync/pull", accessToken);
    expect(await pull.json()).toMatchObject({ data: "v2", version: 2 });
  });

  it("lets two concurrent first pushes settle without a server error", async () => {
    const { accessToken } = await registerAndGetTokens("dave");

    const push = (version: number) =>
      authed("/sync/push", accessToken, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: `v${version}`, version }),
      });

    // The unique owner constraint used to make the loser of this race a 500.
    const codes = (await Promise.all([push(1), push(1)])).map((r) => r.status).sort();
    expect(codes).toEqual([200, 409]);
  });

  it("keeps one account's data out of another's", async () => {
    const alice = await registerAndGetTokens("erin");
    const bob = await registerAndGetTokens("frank");

    await authed("/sync/push", alice.accessToken, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: "alice-only", version: 5 }),
    });

    const pull = await authed("/sync/pull", bob.accessToken);
    expect(await pull.json()).toMatchObject({ data: null, version: 0 });
  });
});

describe("turnstile", () => {
  it("requires a token when a secret is configured", async () => {
    const context: AppContext = {
      db: createSqliteDatabase(dbPath),
      hasher: createWebCryptoHasher(),
      jwtSecret: "secret",
      turnstileSecret: "a-configured-secret",
    };
    const guarded = createApp(() => context);

    // Rejected before any network call, so this is testable offline.
    const res = await guarded.request("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "whoever", password: "whatever" }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "CAPTCHA token required" });
  });
});
