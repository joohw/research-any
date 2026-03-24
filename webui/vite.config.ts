import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { defineConfig } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
import type { Connect } from 'vite';

const require = createRequire(import.meta.url);
// 避免 http-proxy 使用已废弃的 util._extend 触发的 DEP0060
const util = require('node:util');
if ('_extend' in util) (util as any)._extend = Object.assign;

const LOCAL_BACKEND = 'http://127.0.0.1:3751';
const REMOTE_API = 'https://api.rssany.com';

/**
 * 根据请求 Host 决定后端。
 * 本机开发：localhost / 127.0.0.1 / 局域网 / 常见本机别名（rssany、*.local）→ 127.0.0.1:3751。
 * 注意：`allowedHosts` 含 `rssany` 时若此处走 REMOTE_API，浏览器会打到线上 api，本地登录 Cookie 无效，/me 会一直鉴权失败或表现为空白。
 */
function getApiOrigin(host: string | undefined): string {
  if (!host) return REMOTE_API;
  const h = host.split(':')[0].toLowerCase();
  if (h === 'localhost' || h === '127.0.0.1') return LOCAL_BACKEND;
  // 与 server.allowedHosts 对齐：本机 hosts / mDNS 常用名
  if (h === 'rssany' || h.endsWith('.rssany')) return LOCAL_BACKEND;
  if (h.endsWith('.local')) return LOCAL_BACKEND;
  // 局域网私有网段：10.x、172.16–31.x、192.168.x
  if (/^10\.|^172\.(1[6-9]|2[0-9]|3[01])\.|^192\.168\./.test(h)) return LOCAL_BACKEND;
  return REMOTE_API;
}

const proxyPaths = [
  '/api',
  '/auth',
  '/rss',
  '/mcp',
  '/admin/parse',
  '/admin/extractor',
  '/subscription',
];

export default defineConfig({
  plugins: [
    tailwindcss(),
    sveltekit(),
    {
      name: 'proxy-by-host',
      configureServer(server) {
        const { createProxyMiddleware } = require('http-proxy-middleware');
        const proxyMiddleware = createProxyMiddleware({
          target: LOCAL_BACKEND,
          router: (req: Connect.IncomingMessage) => getApiOrigin(req?.headers?.host),
          changeOrigin: true,
          secure: false,
          pathFilter: (pathname: string) =>
            proxyPaths.some((p) => pathname === p || pathname.startsWith(p + "/")),
        });
        server.middlewares.use(proxyMiddleware);
      },
    },
  ],
  server: {
    host: true,
    allowedHosts: ['rssany', '.rssany', 'rssany.com', '.rssany.com'],
    fs: {
      allow: [path.resolve(__dirname, '..')],
    },
  },
});
