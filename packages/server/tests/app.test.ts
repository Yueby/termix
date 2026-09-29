import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AppContext } from "../src/app";
import { createApp } from "../src/app";
import { createSqliteDatabase } from "../src/db/sqlite";
import { createWebCryptoHasher } from "../src/utils/crypto";

let app: ReturnType<typeof createApp>;
let dbPath: string;

beforeEach(() => {
  dbPath = join(tmpdir(), `termix-test-${randomUUID()}.db`);
  // The migrations the deployment runs, not a copy of the schema written by hand. A
  // migration that does not apply, or that describes the wrong columns, now fails here
  // instead of on someone first deploy.
  const raw = new Database(dbPath);
  migrate(drizzle(raw), { migrationsFolder: join(import.meta.dirname, "..", "drizzle") });
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

describe("refresh rotation", () => {
  function refresh(refreshToken: string) {
    return app.request("/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
  }

  it("issues a new pair and spends the old token", async () => {
    const { refreshToken } = await registerAndGetTokens("grace");

    const first = await refresh(refreshToken);
    expect(first.status).toBe(200);
    const rotated = (await first.json()) as { accessToken: string; refreshToken: string };
    expect(rotated.refreshToken).not.toBe(refreshToken);

    // Spending the token is the whole point of rotating it.
    expect((await refresh(refreshToken)).status).toBe(401);

    // And the replacement works.
    expect((await authed("/devices", rotated.accessToken)).status).toBe(200);
  });

  it("lets only one of two simultaneous refreshes win", async () => {
    const { refreshToken } = await registerAndGetTokens("heidi");

    // Nothing forces the interleaving, so this is a best-effort guard: the deterministic
    // guarantee is that the claim is a single statement, and this only tries to notice if
    // that ever stops being true.
    const codes = (await Promise.all([refresh(refreshToken), refresh(refreshToken)]))
      .map((r) => r.status)
      .sort();
    expect(codes).toEqual([200, 401]);
  });

  it("refuses an access token presented as a refresh token", async () => {
    // The mirror of the audience check: the two kinds are not interchangeable in either
    // direction.
    const { accessToken } = await registerAndGetTokens("ivan");
    expect((await refresh(accessToken)).status).toBe(401);
  });

  it("refuses a token that was never issued", async () => {
    expect((await refresh("not-a-token")).status).toBe(401);
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
