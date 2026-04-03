/**
 * Site 插件模板（管理页「添加插件」会复制到 `.rssany/plugins/sources/{id}.rssany.ts`）
 * 修改 `id` 后请与文件名保持一致。
 *
 * 接口说明：app/scraper/sources/web/site.ts
 */

export default {
  id: "__PLUGIN_ID__",
  listUrlPattern: "https://example.com/{segment}",
  refreshInterval: "1day",

  /** sourceId 与订阅里 ref 一致；ctx 含 fetchHtml、extractItem、deps（parseHtml 等） */
  async fetchItems(sourceId, ctx) {
    const { html, finalUrl } = await ctx.fetchHtml(sourceId, {
      waitMs: 2000,
      purify: true,
    });
    const root = ctx.deps.parseHtml(html);
    void root;
    void finalUrl;
    // TODO: 用 ctx.deps.parseHtml 解析列表页，产出 { title, link, summary?, pubDate? } 等 FeedItem
    return [];
  },
};
