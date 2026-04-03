// 内置 RSS/Atom/JSON Feed 插件：匹配 *rss*、*atom*、*.xml 等标准 Feed URL

const UA = "RssAny/1.0 (+https://github.com/joohw/rssany)";

async function fetchFeed(url, ctx) {
  const { deps } = ctx;
  const proxyToUse = ctx.proxy ?? process.env.HTTP_PROXY ?? process.env.HTTPS_PROXY;
  if (proxyToUse) {
    const agent = new deps.HttpsProxyAgent(proxyToUse);
    const parserWithProxy = new deps.RssParser({
      timeout: 15_000,
      headers: {
        "User-Agent": UA,
        Accept: "application/rss+xml,application/atom+xml,application/json,application/xml,text/xml,*/*",
      },
      requestOptions: { agent },
    });
    return parserWithProxy.parseURL(url);
  }
  const parser = new deps.RssParser({
    timeout: 15_000,
    headers: {
      "User-Agent": UA,
      Accept: "application/rss+xml,application/atom+xml,application/json,application/xml,text/xml,*/*",
    },
  });
  return parser.parseURL(url);
}

export default {
  id: "__rss__",
  pattern: /^https?:\/\//,
  match: looksLikeFeed,
  priority: 20,
  refreshInterval: "1h",
  async fetchItems(sourceId, ctx) {
    const { deps } = ctx;
    const feed = await fetchFeed(sourceId, ctx);
    return (feed.items ?? []).map((item) => {
      const link = item.link ?? item.guid ?? sourceId;
      const guid = item.guid ?? deps.createHash("sha256").update(link).digest("hex");
      const pubDate =
        item.pubDate != null
          ? new Date(item.pubDate)
          : item.isoDate != null
            ? new Date(item.isoDate)
            : new Date();
      const authorRaw =
        typeof item.creator === "string" ? item.creator : typeof item.author === "string" ? item.author : undefined;
      const author = authorRaw ? [authorRaw] : undefined;
      const summary =
        typeof item.summary === "string" ? item.summary : typeof item.contentSnippet === "string" ? item.contentSnippet : undefined;
      const content =
        typeof item.content === "string" ? item.content : typeof item["content:encoded"] === "string" ? item["content:encoded"] : undefined;
      return {
        guid,
        title: item.title ?? "",
        link,
        pubDate,
        author,
        summary,
        content,
      };
    });
  },
};

function looksLikeFeed(url) {
  const lower = url.toLowerCase();
  return (
    lower.includes("/feed") ||
    lower.includes("/rss") ||
    lower.includes("/atom") ||
    lower.endsWith(".xml") ||
    lower.endsWith(".rss") ||
    lower.endsWith(".atom") ||
    lower.includes("format=rss") ||
    lower.includes("format=atom") ||
    lower.includes("output=rss")
  );
}
