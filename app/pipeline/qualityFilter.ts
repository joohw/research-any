/**
 * Pipeline 步骤：LLM 内容质量过滤
 *
 * 判定为低质量（无实质信息、垃圾占位、纯广告等）时标记条目为丢弃；
 * feeder 会从数据库删除该条并不再输出到 RSS。
 *
 * 需在 .rssany/config.json 的 pipeline.steps 中启用，且配置 OPENAI_API_KEY 等 LLM 环境变量。
 * 建议放在 tagger / translator 之前以省 token。
 */

import type { FeedItem } from "../types/feedItem.js";
import { markPipelineDrop } from "../types/feedItem.js";
import { logger } from "../core/logger/index.js";

const MAX_BODY_CHARS = 4000;

const SYSTEM = `你是信息质量评估助手。根据标题、摘要与正文片段，判断该条是否值得保留在订阅信息流中。
- 保留（keep: true）：有实质信息、观点、技术内容、新闻价值，或对读者有参考意义。
- 过滤（keep: false）：明显垃圾广告、纯日期/站务占位、无意义一句话、乱码或空白、纯导航无内容、重复无信息量的模板句。
- 只输出 JSON，格式：{"keep": true 或 false, "reason": "一句话中文理由"}`;

export interface QualityFilterContext {
  llm?: { chatJson: (prompt: string, config?: unknown, opts?: { maxTokens?: number; debugLabel?: string }) => Promise<Record<string, unknown>> };
}

function combinedForJudge(item: FeedItem): string {
  const title = (item.title ?? "").trim();
  const summary = (item.summary ?? "").trim();
  let body = (item.content ?? "").trim();
  if (body.length > MAX_BODY_CHARS) body = body.slice(0, MAX_BODY_CHARS) + "\n\n[... 正文已截断 ...]";
  const parts: string[] = [];
  if (title) parts.push(`标题：\n${title}`);
  if (summary) parts.push(`摘要：\n${summary}`);
  if (body) parts.push(`正文：\n${body}`);
  return parts.join("\n\n---\n\n");
}

/** 无 LLM 时跳过 */
export function qualityFilterMatch(_item: FeedItem, ctx: QualityFilterContext): boolean {
  return !!ctx.llm;
}

export async function runQualityFilter(item: FeedItem, ctx: QualityFilterContext): Promise<FeedItem> {
  if (!ctx.llm) return item;

  const text = combinedForJudge(item);
  if (!text.trim()) return item;

  const prompt = `${SYSTEM}\n\n请评估以下条目：\n\n${text}`;

  let res: Record<string, unknown>;
  try {
    res = await ctx.llm.chatJson(prompt, undefined, { maxTokens: 256, debugLabel: "qualityFilter" });
  } catch {
    return item;
  }

  const isKeep = res.keep === true || res.keep === "true";
  const isDrop = res.keep === false || res.keep === "false";
  if (isKeep) return item;
  if (!isDrop) return item;

  const reason = typeof res.reason === "string" ? res.reason.trim() : "";
  logger.info("pipeline", "质量过滤移除条目", { link: item.link, reason: reason || undefined });
  return markPipelineDrop(item);
}
