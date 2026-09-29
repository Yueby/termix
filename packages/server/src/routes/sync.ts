import { zValidator } from "@hono/zod-validator";
import { eq, lt } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { schema } from "../db";
import { requireAuth } from "../middleware/auth";
import type { AppEnv } from "../types";
import { generateId } from "../utils/id";

const MAX_SYNC_SIZE = 10 * 1024 * 1024; // 10MB

const pushSchema = z.object({
  data: z.string().max(MAX_SYNC_SIZE),
  version: z.number().int().positive(),
});

export const syncRoutes = new Hono<AppEnv>()
  .use("/*", requireAuth)

  .get("/status", async (c) => {
    const db = c.var.db;
    const userId = c.var.userId;

    const record = await db
      .select({ version: schema.syncData.version, updatedAt: schema.syncData.updatedAt })
      .from(schema.syncData)
      .where(eq(schema.syncData.userId, userId))
      .get();

    if (!record) {
      return c.json({ version: 0, updatedAt: null });
    }
    return c.json(record);
  })

  .get("/pull", async (c) => {
    const db = c.var.db;
    const userId = c.var.userId;

    const record = await db
      .select()
      .from(schema.syncData)
      .where(eq(schema.syncData.userId, userId))
      .get();

    if (!record) {
      return c.json({ data: null, version: 0 });
    }
    return c.json({ data: record.data, version: record.version });
  })

  .post("/push", zValidator("json", pushSchema), async (c) => {
    const { data, version } = c.req.valid("json");
    const db = c.var.db;
    const userId = c.var.userId;

    // One statement, because a read followed by a separate write is what let a slower
    // request overwrite a newer version: with version 1 stored, pushes carrying 2 and 3
    // both read 1, and whichever wrote last won. The version predicate belongs in the
    // statement itself so the comparison and the write cannot be interleaved, and the
    // upsert keeps two simultaneous first pushes from colliding on the unique owner.
    const written = await db
      .insert(schema.syncData)
      .values({ id: generateId(), userId, data, version, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: schema.syncData.userId,
        set: { data, version, updatedAt: new Date() },
        setWhere: lt(schema.syncData.version, version),
      })
      .returning({ version: schema.syncData.version });

    if (written.length === 0) {
      // Nothing was written, so the stored version is at least this one.
      const current = await db
        .select({ version: schema.syncData.version })
        .from(schema.syncData)
        .where(eq(schema.syncData.userId, userId))
        .get();
      return c.json(
        { error: "Version conflict", serverVersion: current?.version ?? version },
        409,
      );
    }

    return c.json({ ok: true, version });
  });
