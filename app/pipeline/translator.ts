/**
 * Pipeline 步骤：LLM 翻译为中文
 *
 * 将条目的 title、summary、content 翻译为中文，写入 item.translations["zh-CN"]。
 * 路由支持 lng=zh-CN 时可据此返回译文。
 *
 * 需要配置 OPENAI_API_KEY（或等效 LLM 环境变量）。
 *
 * 粗判已为中文的条目不调 LLM（省 token）；展示时 lng=zh-CN 无译文则回退原文。
 */

import type { FeedItem } from "../types/feedItem.js";

const ZH_CN = "zh-CN";
const MAX_CONTENT_CHARS = 6000;
/** 用于语言检测的正文上限（与 runTranslator 截断策略大致一致） */
const DETECT_CONTENT_PREFIX = 2000;

const SYSTEM = `你是一个专业翻译助手。将用户提供的英文（或其他语言）内容翻译为简体中文。
- 保持专业、准确、流畅。
- 若原文已是中文，则保持原样或轻微润色。
- 只输出 JSON，格式：{"title": "译文标题", "summary": "译文摘要", "content": "译文正文"}
- 若某字段为空或用户未提供，对应输出空字符串 ""。`;

export interface TranslatorContext {
  llm?: { chatJson: (prompt: string, config?: unknown, opts?: { maxTokens?: number; debugLabel?: string }) => Promise<Record<string, unknown>> };
}

function combinedTextForDetection(item: FeedItem): string {
  const title = (item.title ?? "").trim();
  const summary = (item.summary ?? item.content?.slice(0, 500) ?? "").trim();
  const content = (item.content ?? "").trim().slice(0, DETECT_CONTENT_PREFIX);
  return `${title}\n${summary}\n${content}`;
}

/**
 * 粗判主体是否已是中文（汉字占比高），用于跳过 LLM。
 * 含日文假名 / 韩文谚文时不视为「已是中文」，避免误跳日文/韩文条目。
 */
export function isLikelyChineseContent(text: string): boolean {
  const t = text.trim();
  if (t.length < 8) return false;
  if (/[\u3040-\u309f\u30a0-\u30ff]/.test(t)) return false;
  if (/[\uac00-\ud7af]/.test(t)) return false;

  const cjk = (t.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) ?? []).length;
  const latin = (t.match(/[A-Za-z]/g) ?? []).length;
  const letterish = cjk + latin;
  if (letterish < 12) return false;
  return cjk / letterish >= 0.55;
}

/** 跳过已有 zh-CN 译文、无 LLM、或粗判已为中文的条目 */
export function translatorMatch(item: FeedItem, ctx: TranslatorContext): boolean {
  const hasZh = item.translations?.[ZH_CN];
  if (hasZh || !ctx.llm) return false;
  if (isLikelyChineseContent(combinedTextForDetection(item))) return false;
  return true;
}

export async function runTranslator(item: FeedItem, ctx: TranslatorContext): Promise<FeedItem> {
  if (!ctx.llm) return item;

  const title = (item.title ?? "").trim();
  const summary = (item.summary ?? item.content?.slice(0, 500) ?? "").trim();
  const content = (item.content ?? "").trim();
  const contentTruncated =
    content.length > MAX_CONTENT_CHARS ? content.slice(0, MAX_CONTENT_CHARS) + "\n\n[... 内容已截断 ...]" : content;

  if (!title && !summary && !content) return item;

  const parts: string[] = [];
  if (title) parts.push(`标题：\n${title}`);
  if (summary) parts.push(`摘要：\n${summary}`);
  if (contentTruncated) parts.push(`正文：\n${contentTruncated}`);

  const prompt = `${SYSTEM}\n\n请翻译以下内容：\n\n${parts.join("\n\n---\n\n")}`;

  let res: Record<string, unknown>;
  try {
    res = await ctx.llm.chatJson(prompt, undefined, {
      maxTokens: Math.min(8192, Math.ceil((title.length + summary.length + contentTruncated.length) * 1.5)),
      debugLabel: "translator",
    });
  } catch {
    return item;
  }

  const tTitle = typeof res.title === "string" ? res.title.trim() : "";
  const tSummary = typeof res.summary === "string" ? res.summary.trim() : "";
  const tContent = typeof res.content === "string" ? res.content.trim() : "";

  if (!tTitle && !tSummary && !tContent) return item;

  item.translations = item.translations ?? {};
  item.translations[ZH_CN] = {
    title: tTitle || undefined,
    summary: tSummary || undefined,
    content: tContent || undefined,
  };

  return item;
}
