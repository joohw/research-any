// 日报报告读写：仅支持系统日报标题（与 dailyReports.json 一致），不允许用户自定义任务

import type { Hono } from "hono";
import { getDailyReportByTitle } from "../../../config/loadDailyReports.js";
import { TOPIC_TASK_BASE_DIR } from "../../../config/paths.js";
import { readDigest, listDigestDates, generateDigest } from "../../../topics/index.js";
import { requireAuth } from "../../../auth/middleware.js";

export function registerAgentTasksRoutes(app: Hono): void {
  app.get("/api/agent-tasks", requireAuth(), async (c) => {
    return c.json({ tasks: [] as [] });
  });

  app.put("/api/agent-tasks", requireAuth(), async (c) => {
    return c.json({ ok: false, message: "不允许自定义日报，仅可使用服务端配置的系统日报。" }, 403);
  });

  app.get("/api/agent-tasks/:key/dates", requireAuth(), async (c) => {
    const key = decodeURIComponent(c.req.param("key") ?? "").trim();
    if (!key) return c.json({ error: "key 参数缺失" }, 400);
    const sys = await getDailyReportByTitle(key);
    if (!sys) return c.json({ error: "非系统日报" }, 404);
    const dates = await listDigestDates(TOPIC_TASK_BASE_DIR, key);
    const latest = dates[0] ?? null;
    return c.json({ key, dates, latest });
  });

  app.get("/api/agent-tasks/:key", requireAuth(), async (c) => {
    const key = decodeURIComponent(c.req.param("key") ?? "").trim();
    if (!key) return c.json({ error: "key 参数缺失" }, 400);
    const sys = await getDailyReportByTitle(key);
    if (!sys) return c.json({ error: "非系统日报" }, 404);
    const date = c.req.query("date");
    const result = await readDigest(TOPIC_TASK_BASE_DIR, key, date);
    if (result === null) {
      return c.json({ key, content: null, date: null, exists: false });
    }
    return c.json({ key, content: result.content, date: result.date, exists: true });
  });

  app.post("/api/agent-tasks/:key/generate", requireAuth(), async (c) => {
    const key = decodeURIComponent(c.req.param("key") ?? "").trim();
    if (!key) return c.json({ error: "key 参数缺失" }, 400);
    const sys = await getDailyReportByTitle(key);
    if (!sys) return c.json({ error: "非系统日报" }, 404);
    const body = await c.req.json<{ force?: boolean }>().catch(() => ({} as { force?: boolean }));
    try {
      const result = await generateDigest(TOPIC_TASK_BASE_DIR, key, body?.force ?? true);
      return c.json(result);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });
}
