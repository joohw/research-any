// 定时 Agent 任务报告：沙盒内 task/_shared/[任务标题]/yyyy-mm-dd.md（全员共享一份，不按用户分目录）

import { mkdir, stat, writeFile, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { runDigestAgent } from "./agent.js";
import { logger } from "../core/logger/index.js";
import { hasAnyEnabledSubscriberForDailyKey } from "../db/index.js";
import { loadDailyReports, getDailyReportByTitle } from "../config/loadDailyReports.js";
import { queryItems } from "../db/index.js";

const TASK_REPORTS_DIR = "task";
/** 系统日报物理目录片段；与 Agent 工具 userId 共用同一标识，便于沙箱隔离 */
const SYSTEM_DAILY_DIGEST_SEGMENT = "_shared";

export interface DigestGenerateResult {
  key: string;
  skipped: boolean;
  path: string;
  reason?: "exists" | "no-items";
  message?: string;
}

/** 话题名转安全的文件名（保留中文等，仅替换路径非法字符） */
function topicToFilename(topic: string): string {
  return topic.replace(/[/\\:*?"<>|]/g, "_").trim() || "default";
}

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function sharedDailyTopicDir(baseDir: string, topicTitle: string): string {
  return join(baseDir, TASK_REPORTS_DIR, SYSTEM_DAILY_DIGEST_SEGMENT, topicToFilename(topicTitle));
}

/** 历史版本在正文前写入的「# 任务报告 · … / > Agent 生成于 …」块，展示与续写 Agent 时去掉 */
function stripLegacyDigestHeader(raw: string): string {
  return raw.replace(
    /^#\s*任务报告\s*·[^\r\n]*(?:\r?\n){2}>\s*Agent[^\r\n]*(?:\r?\n){2}/,
    ""
  );
}

/** 存储路径（相对沙盒根）：task/_shared/[任务标题]/yyyy-mm-dd.md */
export function digestFilePath(baseDir: string, topicTitle: string, date?: string): string {
  const d = date ?? todayDate();
  return join(sharedDailyTopicDir(baseDir, topicTitle), `${d}.md`);
}

/** 当日话题报告文件路径（沙盒内） */
export function topicFilePath(baseDir: string, topic: string): string {
  return digestFilePath(baseDir, topic);
}

export async function digestExists(baseDir: string, topicTitle: string): Promise<boolean> {
  return stat(digestFilePath(baseDir, topicTitle)).then(() => true).catch(() => false);
}

/** 列出该话题已有报告的日期（yyyy-mm-dd），按日期降序 */
export async function listDigestDates(baseDir: string, topicTitle: string): Promise<string[]> {
  try {
    const dir = sharedDailyTopicDir(baseDir, topicTitle);
    const files = await readdir(dir);
    return files
      .filter((f) => f.endsWith(".md"))
      .map((f) => f.slice(0, -3))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

/** 读取报告内容，不存在返回 null。date 不传则读最新日期的文件。返回 { content, date } 便于前端展示 */
export async function readDigest(
  baseDir: string,
  topicTitle: string,
  date?: string
): Promise<{ content: string; date: string } | null> {
  try {
    const dir = sharedDailyTopicDir(baseDir, topicTitle);
    const files = await readdir(dir);
    const mdFiles = files.filter((f) => f.endsWith(".md")).sort().reverse();
    if (mdFiles.length === 0) return null;
    const target = date && mdFiles.includes(`${date}.md`) ? `${date}.md` : mdFiles[0];
    const raw = await readFile(join(dir, target), "utf-8");
    const content = stripLegacyDigestHeader(raw);
    const resolvedDate = target.slice(0, -3);
    return { content, date: resolvedDate };
  } catch {
    return null;
  }
}

/** 读取指定话题的报告内容，不存在返回 null */
export async function readTopicDigest(baseDir: string, topic: string): Promise<string | null> {
  const r = await readDigest(baseDir, topic);
  return r?.content ?? null;
}

export async function topicExists(baseDir: string, topic: string): Promise<boolean> {
  return digestExists(baseDir, topic);
}

export async function listDigestTopics(baseDir: string): Promise<string[]> {
  const taskRoot = join(baseDir, TASK_REPORTS_DIR, SYSTEM_DAILY_DIGEST_SEGMENT);
  try {
    const subdirs = await readdir(taskRoot);
    return subdirs.sort();
  } catch {
    return [];
  }
}

/**
 * 生成报告：Agent 按时间窗拉取候选；topics 的 tags 仅作提示语参考，不参与预检过滤
 */
export async function generateDigest(
  baseDir: string,
  topicTitle: string,
  force = false
): Promise<DigestGenerateResult> {
  const filePath = digestFilePath(baseDir, topicTitle);
  if (!force && (await digestExists(baseDir, topicTitle))) {
    logger.debug("topics", "报告已存在，跳过生成", { key: topicTitle });
    return {
      key: topicTitle,
      skipped: true,
      path: filePath,
      reason: "exists",
      message: "当日报告已存在，已跳过生成",
    };
  }
  return doGenerateTopic(baseDir, topicTitle, filePath);
}

async function doGenerateTopic(
  baseDir: string,
  topicKey: string,
  filePath: string
): Promise<DigestGenerateResult> {
  const systemReport = await getDailyReportByTitle(topicKey);
  if (!systemReport) {
    const err = new Error(`非系统日报: ${topicKey}`);
    logger.warn("topics", err.message);
    throw err;
  }
  const periodDays = Math.max(1, systemReport.refresh);
  const prompt = systemReport.prompt;

  const since = new Date();
  since.setDate(since.getDate() - periodDays);
  const until = new Date();
  until.setDate(until.getDate() + 1);

  const result = await queryItems({
    since,
    until,
    limit: 1,
    offset: 0,
  });
  logger.info("topics", "开始生成 Agent 任务报告", {
    topic: topicKey,
    periodDays,
    windowItemCount: result.total,
  });

  const prevDigest = await readDigest(baseDir, topicKey);
  const previousArticle = prevDigest?.content ?? null;
  let agentContent: string;
  try {
    agentContent = await runDigestAgent(topicKey, {
      userId: SYSTEM_DAILY_DIGEST_SEGMENT,
      periodDays,
      previousArticle,
      prompt,
    });
  } catch (err) {
    logger.error("topics", "话题报告生成失败", { topic: topicKey, err: err instanceof Error ? err.message : String(err) });
    throw err;
  }
  await mkdir(sharedDailyTopicDir(baseDir, topicKey), { recursive: true });
  await writeFile(filePath, agentContent, "utf-8");
  logger.info("topics", "话题报告生成完成", { topic: topicKey, path: filePath });
  return { key: topicKey, skipped: false, path: filePath };
}

export async function generateTopicDigest(
  baseDir: string,
  topic: string,
  force = false
): Promise<{ topic: string; skipped: boolean; path: string; reason?: "exists" | "no-items"; message?: string }> {
  const result = await generateDigest(baseDir, topic, force);
  return {
    topic: result.key,
    skipped: result.skipped,
    path: result.path,
    reason: result.reason,
    message: result.message,
  };
}

/**
 * 为所有「至少有一名订阅者」的系统日报各生成一份（共享文件，供调度器或手动批量调用）
 */
export async function generateAllTopicDigests(baseDir: string): Promise<void> {
  const defs = await loadDailyReports();
  for (const def of defs) {
    const any = await hasAnyEnabledSubscriberForDailyKey(def.key);
    if (!any) continue;
    try {
      await generateTopicDigest(baseDir, def.title, false);
    } catch (err) {
      logger.error("topics", "系统日报生成失败，继续下一任务", {
        topic: def.title,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
