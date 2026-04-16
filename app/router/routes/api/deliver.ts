// /api/deliver、/api/deliver/test — Gateway 基址；固定 POST {gateway}/items、{gateway}/sources，测试 POST {gateway}/test

import type { Hono } from "hono";
import type { FeedItem } from "../../../types/feedItem.js";
import { requireAdmin } from "../../../auth/middleware.js";
import { getDeliverConfig, saveDeliverConfig } from "../../../config/deliver.js";
import { getSourcesRaw } from "../../../scraper/subscription/index.js";
import { feedItemsToPayload, postDeliverGatewayTest } from "../../../deliver/post.js";

export function registerDeliverRoutes(app: Hono): void {
  app.get("/api/deliver", requireAdmin(), async (c) => {
    const { gateway, token } = await getDeliverConfig();
    return c.json({ gateway, token });
  });

  app.put("/api/deliver", requireAdmin(), async (c) => {
    try {
      const body = await c.req.json<{
        gateway?: string;
        token?: string;
        /** 旧版：完整 …/items URL，将迁移为 gateway 基址 */
        url?: string;
      }>();
      const prev = await getDeliverConfig();
      const explicitGateway = body != null && "gateway" in body;
      const explicitUrl = body != null && "url" in body;
      const explicitToken = body != null && "token" in body;
      let gateway = typeof body?.gateway === "string" ? body.gateway.trim() : "";
      if (!gateway && typeof body?.url === "string") {
        gateway = body.url
          .trim()
          .replace(/\/items\/?$/i, "")
          .replace(/\/+$/, "");
      }
      if (!explicitGateway && !explicitUrl) {
        gateway = prev.gateway;
      }
      let token = typeof body?.token === "string" ? body.token.trim() : "";
      if (!explicitToken) {
        token = prev.token;
      }
      await saveDeliverConfig({ gateway, token });
      return c.json({ ok: true, gateway, token });
    } catch (err) {
      return c.json({ ok: false, message: err instanceof Error ? err.message : String(err) }, 400);
    }
  });

  /** 合并测试：仅 POST 到 {gateway}/test，体含示例 items 批次与当前 sources 文档 */
  app.post("/api/deliver/test", requireAdmin(), async (c) => {
    try {
      const body = await c.req.json<{
        gateway?: string;
        token?: string;
        url?: string;
      }>();
      const prev = await getDeliverConfig();
      let gateway = typeof body?.gateway === "string" ? body.gateway.trim() : "";
      if (!gateway && typeof body?.url === "string") {
        gateway = body.url
          .trim()
          .replace(/\/items\/?$/i, "")
          .replace(/\/+$/, "");
      }
      if (!gateway) gateway = prev.gateway;
      const token =
        typeof body?.token === "string" ? body.token.trim() : prev.token;
      if (!gateway.trim()) return c.json({ ok: false, message: "gateway 不能为空" }, 400);

      const now = Date.now();
      const sample: FeedItem = {
        guid: "deliver-test-" + now,
        title: "投递连通性测试",
        link: "https://example.com/rssany-deliver-test",
        pubDate: new Date(),
        summary: "若下游 /test 收到此条，说明 Gateway 可用。",
        sourceRef: "rssany-deliver-test",
      };
      const raw = await getSourcesRaw();
      let sourcesDoc: unknown;
      try {
        sourcesDoc = JSON.parse(raw) as unknown;
      } catch {
        sourcesDoc = { sources: [] };
      }

      const payload = {
        rssanyConnectivityTest: true,
        items: {
          sourceRef: "rssany-deliver-test",
          items: feedItemsToPayload([sample]),
        },
        sources: sourcesDoc,
      };
      await postDeliverGatewayTest(gateway.trim(), payload, { bearerToken: token || undefined });
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ ok: false, message: err instanceof Error ? err.message : String(err) }, 400);
    }
  });
}
