import { zValidator } from "@hono/zod-validator";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { schema } from "../db";
import { requireAuth } from "../middleware/auth";
import type { AppEnv } from "../types";
import { generateId } from "../utils/id";

const createDeviceSchema = z.object({
  name: z.string().min(1).max(64),
  platform: z.string().min(1).max(32),
  publicKey: z.string().min(1).max(4096),
});

const updateDeviceSchema = z.object({
  name: z.string().min(1).max(64).optional(),
  publicKey: z.string().min(1).max(4096).optional(),
});

export const deviceRoutes = new Hono<AppEnv>()
  .use("/*", requireAuth)

  .get("/", async (c) => {
    const db = c.var.db;
    const userId = c.var.userId;
    const result = await db
      .select()
      .from(schema.devices)
      .where(eq(schema.devices.userId, userId));
    return c.json(result);
  })

  .post("/", zValidator("json", createDeviceSchema), async (c) => {
    const { name, platform, publicKey } = c.req.valid("json");
    const db = c.var.db;
    const userId = c.var.userId;

    const id = generateId();
    await db.insert(schema.devices).values({
      id,
      userId,
      name,
      platform,
      publicKey,
      createdAt: new Date(),
    });

    return c.json({ id, name, platform, publicKey }, 201);
  })

  .put("/:id", zValidator("json", updateDeviceSchema), async (c) => {
    const db = c.var.db;
    const userId = c.var.userId;
    const deviceId = c.req.param("id");
    const raw = c.req.valid("json");
    const updates = Object.fromEntries(
      Object.entries(raw).filter(([, v]) => v !== undefined),
    );

    if (Object.keys(updates).length === 0) {
      return c.json({ error: "No fields to update" }, 400);
    }

    const device = await db
      .select()
      .from(schema.devices)
      .where(and(eq(schema.devices.id, deviceId), eq(schema.devices.userId, userId)))
      .get();

    if (!device) {
      return c.json({ error: "Device not found" }, 404);
    }

    await db
      .update(schema.devices)
      .set(updates)
      .where(eq(schema.devices.id, deviceId));

    return c.json({ ...device, ...updates });
  })

  .delete("/:id", async (c) => {
    const db = c.var.db;
    const userId = c.var.userId;
    const deviceId = c.req.param("id");

    const device = await db
      .select()
      .from(schema.devices)
      .where(and(eq(schema.devices.id, deviceId), eq(schema.devices.userId, userId)))
      .get();

    if (!device) {
      return c.json({ error: "Device not found" }, 404);
    }

    await db.delete(schema.devices).where(eq(schema.devices.id, deviceId));
    return c.json({ ok: true });
  });
