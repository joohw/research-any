// 全局 HTTP(S) 代理：读写 .rssany/config.json 的 globalProxy；与单源代理合并见 subscription/getEffectiveProxyForListUrl

import { readFile, writeFile } from "node:fs/promises";
import { CONFIG_PATH } from "./paths.js";

export async function readGlobalProxyFromConfig(): Promise<string | undefined> {
  try {
    const raw = await readFile(CONFIG_PATH, "utf-8");
    const j = JSON.parse(raw) as { globalProxy?: unknown };
    if (typeof j.globalProxy === "string") {
      const t = j.globalProxy.trim();
      return t.length > 0 ? t : undefined;
    }
  } catch {
    /* 无文件或解析失败 */
  }
  return undefined;
}

/** 写入或清空（空串则删除键） */
export async function saveGlobalProxyToConfig(proxy: string): Promise<void> {
  let root: Record<string, unknown> = {};
  try {
    const raw = await readFile(CONFIG_PATH, "utf-8");
    root = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    //
  }
  const t = proxy.trim();
  if (t.length === 0) {
    delete root.globalProxy;
  } else {
    root.globalProxy = t;
  }
  await writeFile(CONFIG_PATH, JSON.stringify(root, null, 2) + "\n", "utf-8");
}

/** 插件 Site 声明的 proxy 优先于 config 全局代理 */
export async function resolveProxyForSite(site: { proxy?: string }): Promise<string | undefined> {
  const s = site.proxy?.trim();
  if (s) return s;
  return readGlobalProxyFromConfig();
}
