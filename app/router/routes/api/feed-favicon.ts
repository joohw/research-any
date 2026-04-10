// GET /api/feed-favicon?domain=example.com — 信源列表站点图标；磁盘缓存在 CACHE_DIR/feed-favicons。
//
// 合法 domain 时始终返回 200 + 可用图片：上游全部失败则回退为字母 SVG（按域名稳定着色）。
// 磁盘与 HTTP 缓存均为 3 天（mtime / max-age），过期后重新抓取。
//
// 多路上游并行竞速（Promise.any）。默认不含 Google s2（国内访问差）：设 FAVICON_INCLUDE_GOOGLE=1 可启用。
// 境外聚合源（DDG / icon.horse / unavatar）在国内网络可能慢或失败；若仅需直连站点图标，设 FAVICON_THIRD_PARTY=0。
// 解析首页 HTML 中 link[rel~=icon] 等（尊重 <base href>）；设 FAVICON_SKIP_HTML=1 可关闭。
// 同域名 in-flight 合并。

import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir, unlink, stat } from "node:fs/promises";
import { join } from "node:path";
import { parse } from "node-html-parser";
import type { Hono } from "hono";
import { CACHE_DIR } from "../../../config/paths.js";

const CACHE_SUBDIR = "feed-favicons";
const CACHE_KEY_PREFIX = "feed-favicon:v1:";
/** 磁盘与 CDN/浏览器缓存：3 天 */
const CACHE_MAX_AGE_SEC = 3 * 24 * 60 * 60;
const CACHE_MAX_AGE_MS = CACHE_MAX_AGE_SEC * 1000;
const CACHE_CONTROL = `public, max-age=${CACHE_MAX_AGE_SEC}`;

const FETCH_TIMEOUT_MS = 6_000;
const MAX_ICON_BYTES = 2 * 1024 * 1024;
const MAX_HTML_BYTES = 512 * 1024;

const inflightByDomain = new Map<string, Promise<{ buf: Buffer; mime: string }>>();

const MAX_DOMAIN_LEN = 253;

function isPlausibleHostname(s: string): boolean {
  if (s.length === 0 || s.length > MAX_DOMAIN_LEN) return false;
  return /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/i.test(s);
}

function cacheFilePath(domainKey: string): string {
  const h = createHash("sha256").update(CACHE_KEY_PREFIX + domainKey.toLowerCase()).digest("hex");
  return join(CACHE_DIR, CACHE_SUBDIR, h);
}

/** 直连目标站常见图标路径（不依赖境外 CDN，适合国内部署优先尝试） */
function originFaviconUrls(domain: string): string[] {
  const d = domain.toLowerCase();
  const hosts: string[] = [`https://${d}`];
  if (d.startsWith("www.")) {
    const bare = d.slice(4);
    if (bare) hosts.push(`https://${bare}`);
  } else {
    hosts.push(`https://www.${d}`);
  }
  const paths = ["/favicon.ico", "/favicon.png", "/apple-touch-icon.png"];
  const urls: string[] = [];
  for (const base of [...new Set(hosts)]) {
    for (const p of paths) {
      urls.push(`${base}${p}`);
    }
  }
  return urls;
}

function homepageUrlsForDomain(domain: string): string[] {
  const d = domain.toLowerCase();
  const urls = [`https://${d}/`];
  if (d.startsWith("www.")) {
    const bare = d.slice(4);
    if (bare) urls.push(`https://${bare}/`);
  } else {
    urls.push(`https://www.${d}/`);
  }
  return [...new Set(urls)];
}

function isIconLinkRel(rel: string): boolean {
  const tokens = rel
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (tokens.some((x) => x === "mask-icon")) return true;
  if (tokens.some((x) => x === "apple-touch-icon" || x === "apple-touch-icon-precomposed")) return true;
  if (tokens.includes("shortcut") && tokens.includes("icon")) return true;
  return tokens.includes("icon");
}

/** 从 HTML 提取 <link rel="icon" …> 等 href，按文档顺序去重 */
function parseLinkIconHrefs(html: string, pageUrl: string): string[] {
  const root = parse(html, { lowerCaseTagName: true });
  let base = pageUrl;
  const baseEl = root.querySelector("base[href]");
  if (baseEl) {
    const bh = baseEl.getAttribute("href")?.trim();
    if (bh) {
      try {
        base = new URL(bh, pageUrl).href;
      } catch {
        /* keep pageUrl */
      }
    }
  }
  const out: string[] = [];
  const seen = new Set<string>();
  for (const el of root.querySelectorAll("link[href]")) {
    const rel = el.getAttribute("rel") ?? "";
    if (!isIconLinkRel(rel)) continue;
    const href = el.getAttribute("href")?.trim();
    if (!href || href.startsWith("data:") || href.startsWith("blob:")) continue;
    try {
      const abs = new URL(href, base).href;
      if ((abs.startsWith("http:") || abs.startsWith("https:")) && !seen.has(abs)) {
        seen.add(abs);
        out.push(abs);
      }
    } catch {
      /* skip */
    }
  }
  return out;
}

async function fetchHtmlPage(url: string): Promise<string | null> {
  try {
    const upstream = await fetch(url, {
      redirect: "follow",
      headers: {
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
        "User-Agent": "Mozilla/5.0 (compatible; RssAny/1.0; +https://github.com/rssany/rssany) favicon",
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!upstream.ok) return null;
    const ab = await upstream.arrayBuffer();
    const buf = Buffer.from(ab);
    const slice = buf.subarray(0, Math.min(buf.length, MAX_HTML_BYTES));
    return slice.toString("utf-8");
  } catch {
    return null;
  }
}

/** 抓取首页 HTML，解析 link 图标；按候选首页顺序直到得到至少一条 href */
async function discoverIconUrlsFromHomepage(domain: string): Promise<string[]> {
  if (process.env.FAVICON_SKIP_HTML === "1" || process.env.FAVICON_SKIP_HTML === "true") {
    return [];
  }
  for (const pageUrl of homepageUrlsForDomain(domain)) {
    const html = await fetchHtmlPage(pageUrl);
    if (!html) continue;
    const hrefs = parseLinkIconHrefs(html, pageUrl);
    if (hrefs.length > 0) return hrefs;
  }
  return [];
}

function duckduckgoFaviconUrl(domain: string): string {
  return `https://icons.duckduckgo.com/ip3/${domain}.ico`;
}

function iconHorseUrl(domain: string): string {
  return `https://icon.horse/icon/${encodeURIComponent(domain)}`;
}

function unavatarUrl(domain: string): string {
  return `https://unavatar.io/${encodeURIComponent(domain)}`;
}

function googleFaviconUrl(domain: string): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`;
}

function letterCharFromDomain(domain: string): string {
  const d = domain.toLowerCase().replace(/^www\./, "");
  const m = d.match(/[a-z0-9]/);
  return m ? m[0]!.toUpperCase() : "?";
}

function hueFromDomain(domain: string): number {
  const h = createHash("sha256").update(domain.toLowerCase()).digest();
  return ((h[0]! << 8) | h[1]!) % 360;
}

function escapeXmlText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** 上游全部失败时的稳定回退：圆角方块 + 首字母 */
function letterAvatarSvg(domain: string): Buffer {
  const letter = escapeXmlText(letterCharFromDomain(domain));
  const hue = hueFromDomain(domain);
  const bg = `hsl(${hue} 42% 44%)`;
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="12" fill="${bg}"/>
  <text x="32" y="32" dominant-baseline="central" text-anchor="middle" fill="#ffffff" font-family="system-ui,Segoe UI,Helvetica,sans-serif" font-size="28" font-weight="600">${letter}</text>
</svg>`;
  return Buffer.from(svg.trim(), "utf-8");
}

function letterAvatarForDomain(domain: string): { buf: Buffer; mime: string } {
  return { buf: letterAvatarSvg(domain), mime: "image/svg+xml" };
}

function isEnoent(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as NodeJS.ErrnoException).code === "ENOENT";
}

function sniffImageMime(buf: Buffer): string | null {
  if (buf.length < 4) return null;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
  if (buf.length >= 6 && buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return "image/gif";
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (
    buf.length >= 12 &&
    buf.subarray(0, 4).toString("ascii") === "RIFF" &&
    buf.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  if (buf.length >= 6 && buf.readUInt16LE(0) === 0 && (buf[2] === 1 || buf[2] === 2) && buf[3] === 0) {
    return "image/x-icon";
  }
  const head = buf.subarray(0, Math.min(256, buf.length)).toString("utf-8").trimStart();
  if (head.startsWith("<svg") || head.startsWith("<?xml")) return "image/svg+xml";
  return null;
}

const IMAGE_CT_PREFIX = "image/";

function mimeFromFetch(ct: string | null): string | null {
  if (!ct) return null;
  const base = ct.split(";")[0].trim().toLowerCase();
  return base.startsWith(IMAGE_CT_PREFIX) ? base : null;
}

function resolveImageMime(buf: Buffer, ct: string | null): string | null {
  return sniffImageMime(buf) ?? mimeFromFetch(ct);
}

async function fetchIconCandidate(url: string): Promise<{ buf: Buffer; ct: string | null } | null> {
  let upstream: Response;
  try {
    upstream = await fetch(url, {
      redirect: "follow",
      headers: {
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        "User-Agent": "Mozilla/5.0 (compatible; RssAny/1.0; +https://github.com/rssany/rssany) favicon",
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch {
    return null;
  }
  if (!upstream.ok) return null;
  const ab = await upstream.arrayBuffer();
  const buf = Buffer.from(ab);
  if (buf.length === 0 || buf.length > MAX_ICON_BYTES) return null;
  return { buf, ct: upstream.headers.get("content-type") };
}

function isValidIcon(got: { buf: Buffer; ct: string | null } | null): got is { buf: Buffer; ct: string | null } {
  if (!got) return false;
  const mime = resolveImageMime(got.buf, got.ct);
  return !!(mime && mime.startsWith(IMAGE_CT_PREFIX));
}

function upstreamFaviconUrls(domain: string, htmlIconUrls: string[]): string[] {
  const urls: string[] = [...originFaviconUrls(domain), ...htmlIconUrls];
  const thirdPartyOff =
    process.env.FAVICON_THIRD_PARTY === "0" || process.env.FAVICON_THIRD_PARTY === "false";
  if (!thirdPartyOff) {
    urls.push(duckduckgoFaviconUrl(domain), iconHorseUrl(domain), unavatarUrl(domain));
  }
  const includeGoogle =
    process.env.FAVICON_INCLUDE_GOOGLE === "1" || process.env.FAVICON_INCLUDE_GOOGLE === "true";
  if (includeGoogle) urls.push(googleFaviconUrl(domain));
  return urls;
}

async function fetchFaviconFromNetwork(domain: string): Promise<{ buf: Buffer; mime: string }> {
  const htmlIconUrls = await discoverIconUrlsFromHomepage(domain);
  const urls = upstreamFaviconUrls(domain, htmlIconUrls);
  const tasks = urls.map(async (url) => {
    const got = await fetchIconCandidate(url);
    if (!isValidIcon(got)) {
      throw new Error("not-an-icon");
    }
    const mime = resolveImageMime(got.buf, got.ct)!;
    return { buf: got.buf, mime };
  });
  try {
    return await Promise.any(tasks);
  } catch {
    return letterAvatarForDomain(domain);
  }
}

function fetchFaviconDeduped(domain: string): Promise<{ buf: Buffer; mime: string }> {
  let p = inflightByDomain.get(domain);
  if (p) return p;
  p = fetchFaviconFromNetwork(domain).finally(() => {
    if (inflightByDomain.get(domain) === p) inflightByDomain.delete(domain);
  });
  inflightByDomain.set(domain, p);
  return p;
}

export function registerFeedFaviconRoutes(app: Hono): void {
  app.get("/api/feed-favicon", async (c) => {
    const raw = (c.req.query("domain") ?? "").trim();
    if (!raw || !isPlausibleHostname(raw)) {
      return new Response(null, { status: 400 });
    }
    const domain = raw.toLowerCase();
    const path = cacheFilePath(domain);

    let diskStale = false;
    try {
      const st = await stat(path);
      if (Date.now() - st.mtimeMs >= CACHE_MAX_AGE_MS) {
        diskStale = true;
        await unlink(path).catch(() => {});
      }
    } catch (e) {
      if (!isEnoent(e)) {
        return new Response(null, { status: 500 });
      }
    }

    if (!diskStale) {
      try {
        const cached = await readFile(path);
        const mime = resolveImageMime(cached, null);
        if (mime) {
          return new Response(new Uint8Array(cached), {
            status: 200,
            headers: {
              "Content-Type": mime,
              "Cache-Control": CACHE_CONTROL,
            },
          });
        }
        await unlink(path).catch(() => {});
      } catch (e) {
        if (!isEnoent(e)) {
          return new Response(null, { status: 500 });
        }
      }
    }

    const resolved = await fetchFaviconDeduped(domain);
    const { buf, mime } = resolved;

    try {
      await mkdir(join(CACHE_DIR, CACHE_SUBDIR), { recursive: true });
      await writeFile(path, buf);
    } catch {
      return new Response(null, { status: 500 });
    }

    return new Response(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": mime,
        "Cache-Control": CACHE_CONTROL,
      },
    });
  });
}
