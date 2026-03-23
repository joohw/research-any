// 系统日报：定义在 app/config/dailyReports.json（全员相同），每人仅开关不同

import type { Hono } from "hono";
import { loadDailyReports } from "../../../config/loadDailyReports.js";
import {
  getDailySubscriptionMap,
  setDailySubscription,
  probeDailySubscriptionsTableAvailable,
} from "../../../db/index.js";
import { refreshTopicsScheduler } from "../../../topics/scheduler.js";
import { requireAuth } from "../../../auth/middleware.js";

export function registerDailyReportsRoutes(app: Hono): void {
  app.get("/api/daily-reports", requireAuth(), async (c) => {
    const userId = c.get("userId") as string;
    const [defs, subMap, dbReady] = await Promise.all([
      loadDailyReports(),
      getDailySubscriptionMap(userId),
      probeDailySubscriptionsTableAvailable(),
    ]);
    const reports = defs.map((def) => ({
      key: def.key,
      title: def.title,
      description: def.description,
      prompt: def.prompt,
      refresh: def.refresh,
      defaultEnabled: def.defaultEnabled,
      enabled: subMap.get(def.key) === true,
    }));
    return c.json({ reports, dbReady });
  });

  app.put("/api/daily-reports", requireAuth(), async (c) => {
    try {
      const userId = c.get("userId") as string;
      const body = await c.req.json<{ key?: string; enabled?: boolean }>();
      const key = typeof body?.key === "string" ? body.key.trim() : "";
      if (!key) return c.json({ ok: false, message: "key 缺失" }, 400);
      const enabled = body?.enabled === true;
      await setDailySubscription(userId, key, enabled);
      void refreshTopicsScheduler().catch(() => {});
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ ok: false, message: err instanceof Error ? err.message : String(err) }, 400);
    }
  });
}
