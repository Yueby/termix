import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { schema } from "../db";
import type { AppEnv } from "../types";

export const keysRoutes = new Hono<AppEnv>()
  .get("/:userId", async (c) => {
    const db = c.var.db;
    const userId = c.req.param("userId");

    const devices = await db
      .select({ publicKey: schema.devices.publicKey, name: schema.devices.name })
      .from(schema.devices)
      .where(eq(schema.devices.userId, userId));

    if (devices.length === 0) {
      return c.text("# No keys found\n", 404);
    }

    const keys = devices
      .map((d) => `# ${d.name}\n${d.publicKey}`)
      .join("\n\n");

    return c.text(keys + "\n", 200, { "Content-Type": "text/plain; charset=utf-8" });
  });
