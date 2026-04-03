// GET/PUT /api/proxy — config.json 全局代理（admin）

import type { Hono } from "hono";
import { requireAdmin } from "../../../auth/middleware.js";
import { readGlobalProxyFromConfig, saveGlobalProxyToConfig } from "../../../config/globalProxy.js";

export function registerProxySettingsRoutes(app: Hono): void {
  app.get("/api/proxy", requireAdmin(), async (c) => {
    const globalProxy = (await readGlobalProxyFromConfig()) ?? "";
    return c.json({ globalProxy });
  });

  app.put("/api/proxy", requireAdmin(), async (c) => {
    try {
      const body = (await c.req.json().catch(() => ({}))) as { globalProxy?: unknown };
      const globalProxy = typeof body.globalProxy === "string" ? body.globalProxy : "";
      await saveGlobalProxyToConfig(globalProxy);
      const saved = (await readGlobalProxyFromConfig()) ?? "";
      return c.json({ ok: true, globalProxy: saved });
    } catch (err) {
      return c.json(
        { ok: false, message: err instanceof Error ? err.message : String(err) },
        400,
      );
    }
  });
}
