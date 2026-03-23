// 路径配置：集中管理所有运行时路径，区分项目文件与用户数据

import { mkdir, rename, access, readFile, writeFile } from "node:fs/promises";
import { join, resolve, relative } from "node:path";
import { logger } from "../core/logger/index.js";


/** 用户数据根目录：.rssany/（不纳入版本管理，存放所有运行时用户数据） */
export const USER_DIR = join(process.cwd(), ".rssany");

/** Agent 文件工具沙箱根目录：.rssany/sandbox/ */
export const SANDBOX_DIR = join(USER_DIR, "sandbox");

/** 每用户 Agent 工作区：.rssany/sandbox/agent/{safeUserId}/（对话与 sandbox 工具仅访问此目录，与 task/ 报告目录分离） */
const USER_AGENT_DIRNAME = "agent";

/** userId → 安全目录名片段（与 task 报告中的用户目录规则一致） */
export function userIdToSafeSegment(id: string): string {
  return id.replace(/[/\\:*?"<>|]/g, "_").trim() || "user";
}

/** 当前用户在沙盒内的 Agent 根目录（绝对路径） */
export function userAgentSandboxRoot(userId: string): string {
  return join(SANDBOX_DIR, USER_AGENT_DIRNAME, userIdToSafeSegment(userId));
}

/** 系统日报任务报告：沙盒内 task/_shared/[任务名]/yyyy-mm-dd.md（.rssany/sandbox/…，全员共享一份） */
export const TOPIC_TASK_BASE_DIR = SANDBOX_DIR;

/** 将相对路径解析到「当前用户 Agent 目录」内绝对路径，禁止逃逸；path 为相对该用户 agent 根的路径。 */
export function resolveUserAgentSandboxPath(
  userId: string,
  path: string,
): { absolute: string } | { error: string } {
  const root = userAgentSandboxRoot(userId);
  const normalized = path.replace(/\\/g, "/").replace(/\/+/g, "/").trim() || ".";
  const absolute = resolve(root, normalized);
  const rel = relative(root, absolute);
  if (rel.startsWith("..") || resolve(root, rel) !== absolute) {
    return { error: "路径不允许访问沙箱外目录" };
  }
  return { absolute };
}

/** 缓存目录：.rssany/cache/（fetched、extracted、feeds、domains、browser_data 等子目录）；环境变量 CACHE_DIR 可覆盖 */
export const CACHE_DIR = process.env.CACHE_DIR ?? join(USER_DIR, "cache");


/** 站点配置文件：.rssany/sites.json */
export const SITES_CONFIG_PATH = join(USER_DIR, "sites.json");


/** 爬虫配置：.rssany/sources.json（扁平信源列表，供 scheduler 使用） */
export const SOURCES_CONFIG_PATH = join(USER_DIR, "sources.json");


/** 首页信息流频道配置：.rssany/channels.json（channel → sourceRefs，供 Feed API 使用） */
export const CHANNELS_CONFIG_PATH = join(USER_DIR, "channels.json");


/** 系统标签配置：.rssany/tags.json（供 pipeline tagger 使用） */
export const TAGS_CONFIG_PATH = join(USER_DIR, "tags.json");

/** 全局配置：.rssany/config.json（enrich、pipeline 等） */
export const CONFIG_PATH = join(USER_DIR, "config.json");


/** @deprecated 仅用于迁移：若存在 .rssany/subscriptions.json 且无 sources.json 则迁移为 sources.json */
const LEGACY_SUBSCRIPTIONS_PATH = join(USER_DIR, "subscriptions.json");


/** 内置插件目录：plugins/（项目文件，纳入版本管理） */
export const BUILTIN_PLUGINS_DIR = join(process.cwd(), "plugins");


/** 用户自定义插件目录：.rssany/plugins/（用户数据，不纳入版本管理） */
export const USER_PLUGINS_DIR = join(USER_DIR, "plugins");


/** 插件子目录：sources（信源） / enrich（补全）；pipeline 已移至 app/pipeline/ 作为固定流程 */
export const BUILTIN_SOURCES_DIR = join(BUILTIN_PLUGINS_DIR, "sources");
export const USER_SOURCES_DIR = join(USER_PLUGINS_DIR, "sources");
export const BUILTIN_ENRICH_DIR = join(BUILTIN_PLUGINS_DIR, "enrich");
export const USER_ENRICH_DIR = join(USER_PLUGINS_DIR, "enrich");


/** 检查路径是否存在 */
async function pathExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}


/** 迁移单个文件：仅在源存在且目标不存在时执行，迁移失败只打警告不中断 */
async function migrateFile(from: string, to: string): Promise<void> {
  if (!(await pathExists(from))) return;
  if (await pathExists(to)) return;
  try {
    await rename(from, to);
    logger.info("config", "配置已迁移", { from, to });
  } catch (err) {
    logger.warn("config", "配置迁移失败", { from, to, err: err instanceof Error ? err.message : String(err) });
  }
}


/** 初始化用户数据目录，自动迁移旧版配置文件到 .rssany/ */
export async function initUserDir(): Promise<void> {
  await mkdir(USER_DIR, { recursive: true });
  await mkdir(SANDBOX_DIR, { recursive: true });
  await mkdir(join(SANDBOX_DIR, USER_AGENT_DIRNAME), { recursive: true });
  await mkdir(CACHE_DIR, { recursive: true });
  await mkdir(USER_PLUGINS_DIR, { recursive: true });
  await mkdir(USER_SOURCES_DIR, { recursive: true });
  await mkdir(USER_ENRICH_DIR, { recursive: true });
  await migrateFile(join(process.cwd(), "sites.json"), SITES_CONFIG_PATH);
  await migrateFile(join(process.cwd(), "subscriptions.json"), SOURCES_CONFIG_PATH);
  if (!(await pathExists(SOURCES_CONFIG_PATH)) && (await pathExists(LEGACY_SUBSCRIPTIONS_PATH))) {
    await migrateFile(LEGACY_SUBSCRIPTIONS_PATH, SOURCES_CONFIG_PATH);
  }
  if (!(await pathExists(CHANNELS_CONFIG_PATH)) && (await pathExists(SOURCES_CONFIG_PATH))) {
    try {
      const raw = await readFile(SOURCES_CONFIG_PATH, "utf-8");
      const parsed = JSON.parse(raw) as unknown;
      const refs: string[] = [];
      if (parsed && typeof parsed === "object") {
        if (Array.isArray((parsed as { sources?: unknown[] }).sources)) {
          for (const s of (parsed as { sources: { ref?: string }[] }).sources) {
            if (s?.ref) refs.push(s.ref);
          }
        } else {
          for (const entry of Object.values(parsed as Record<string, { sources?: Array<{ ref?: string }> }>)) {
            if (entry && Array.isArray(entry.sources)) {
              for (const s of entry.sources) {
                if (s?.ref) refs.push(s.ref);
              }
            }
          }
        }
      }
      const channels: Record<string, { title: string; sourceRefs: string[] }> = {
        all: { title: "全部", sourceRefs: refs },
      };
      await writeFile(CHANNELS_CONFIG_PATH, JSON.stringify(channels, null, 2) + "\n", "utf-8");
      logger.info("config", "已根据 sources.json 生成默认 channels.json");
    } catch (err) {
      logger.warn("config", "生成 channels.json 失败", { err: err instanceof Error ? err.message : String(err) });
    }
  }

}
