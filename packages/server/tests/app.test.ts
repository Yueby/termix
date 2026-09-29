import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AppContext } from "../src/app";
import { createApp } from "../src/app";
import { createSqliteDatabase } from "../src/db/sqlite";

const TOKEN = "test-token-0123456789abcdef";

let app: ReturnType<typeof createApp>;
let context: AppContext;
let dbPath: string;

beforeEach(() => {
  dbPath = join(tmpdir(), `termix-test-${randomUUID()}.db`);

  // Deliberately not migrating here. `createSqliteDatabase` does it, so these tests exercise
  // the same startup path a deployment does — a migration that stops being applied fails
  // here rather than silently on somebody's first deploy.
  context = { db: createSqliteDatabase(dbPath), apiToken: TOKEN };
  app = createApp(() => context);
});

afterEach(async () => {
  const { unlink } = await import("node:fs/promises");
  await unlink(dbPath).catch(() => {});
});

function authed(path: string, init: RequestInit = {}) {
  return app.request(path, {
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${TOKEN}` },
  });
}

function push(body: { data: string; version: number }) {
  return authed("/sync/push", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("app assembly", () => {
  it("reaches the database, so the context middleware runs before the routes", async () => {
    // A query can only succeed if the database arrived in the request context — which is
    // exactly what did not happen while the context middleware was registered after the
    // routes: every request was routed and answered from an empty context.
    const res = await authed("/sync/status");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ version: 0 });
  });

  it("serves health without a token", async () => {
    // A liveness check that needs a credential cannot tell "up" from "wrong token".
    expect((await app.request("/health")).status).toBe(200);
  });
});

describe("token authentication", () => {
  it("refuses a request with no token", async () => {
    expect((await app.request("/sync/status")).status).toBe(401);
  });

  it("refuses a wrong token", async () => {
    const res = await app.request("/sync/status", {
      headers: { Authorization: "Bearer not-the-token" },
    });
    expect(res.status).toBe(401);
  });

  it("refuses a token that is only a prefix of the real one", async () => {
    const res = await app.request("/sync/status", {
      headers: { Authorization: `Bearer ${TOKEN.slice(0, -1)}` },
    });
    expect(res.status).toBe(401);
  });

  it("refuses a token presented without the Bearer scheme", async () => {
    const res = await app.request("/sync/status", { headers: { Authorization: TOKEN } });
    expect(res.status).toBe(401);
  });

  it("accepts the configured token", async () => {
    expect((await authed("/sync/status")).status).toBe(200);
  });

  it("refuses every request when the server has no token configured", async () => {
    // Reading an unconfigured token as "auth is off" is the difference between a closed
    // vault and an open one.
    const unconfigured = createApp(() => ({ ...context, apiToken: "" }));
    const res = await unconfigured.request("/sync/status", {
      headers: { Authorization: "Bearer anything-at-all" },
    });
    expect(res.status).toBe(500);
  });
});

describe("the vault", () => {
  it("reports an empty vault before anything is pushed", async () => {
    expect(await (await authed("/sync/pull")).json()).toMatchObject({ data: null, version: 0 });
    expect(await (await authed("/sync/status")).json()).toMatchObject({ version: 0 });
  });

  it("stores what is pushed and returns it", async () => {
    expect((await push({ data: "v1", version: 1 })).status).toBe(200);
    expect(await (await authed("/sync/pull")).json()).toMatchObject({ data: "v1", version: 1 });
    expect(await (await authed("/sync/status")).json()).toMatchObject({ version: 1 });
  });

  it("accepts a newer version and refuses an older one", async () => {
    await push({ data: "v2", version: 2 });

    expect((await push({ data: "stale", version: 1 })).status).toBe(409);
    // A rejected push must not have written anything: this is the regression the
    // read-then-write version check allowed, where a slower request carrying an older
    // version could land last and overwrite newer data while both reported success.
    expect(await (await authed("/sync/pull")).json()).toMatchObject({ data: "v2", version: 2 });
  });

  it("says what the server holds when it refuses a push", async () => {
    await push({ data: "v3", version: 3 });
    const conflict = await push({ data: "old", version: 2 });
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toMatchObject({ serverVersion: 3 });
  });

  it("lets two concurrent first pushes settle without a server error", async () => {
    const codes = (
      await Promise.all([push({ data: "a", version: 1 }), push({ data: "b", version: 1 })])
    )
      .map((r) => r.status)
      .sort();
    expect(codes).toEqual([200, 409]);
  });

  it("rejects a payload over the size limit", async () => {
    const huge = "x".repeat(10 * 1024 * 1024 + 1);
    expect((await push({ data: huge, version: 1 })).status).toBe(400);
  });

  it("rejects a malformed body", async () => {
    expect((await push({ data: "x", version: 0 })).status).toBe(400);
  });
});
