import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
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

    const existing = await db
      .select({ id: schema.syncData.id, version: schema.syncData.version })
      .from(schema.syncData)
      .where(eq(schema.syncData.userId, userId))
      .get();

    if (existing) {
      if (version <= existing.version) {
        return c.json({ error: "Version conflict", serverVersion: existing.version }, 409);
      }
      await db
        .update(schema.syncData)
        .set({ data, version, updatedAt: new Date() })
        .where(eq(schema.syncData.id, existing.id));
    } else {
      await db.insert(schema.syncData).values({
        id: generateId(),
        userId,
        data,
        version,
        updatedAt: new Date(),
      });
    }

    return c.json({ ok: true, version });
  });
