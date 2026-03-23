// 系统日报订阅邮件：读取 task/_shared 下已生成 Markdown，按用户订阅发送

import { TOPIC_TASK_BASE_DIR } from "../config/paths.js";
import { getEmailSender } from "../email/sender.js";
import { renderResearch } from "../email/templates/research.js";
import { listEnabledSubscribersWithEmailForDailyKey } from "../db/index.js";
import { logger } from "../core/logger/index.js";
import { readDigest } from "./index.js";

function appBaseUrl(): string {
  return (process.env.PUBLIC_APP_URL ?? process.env.APP_ORIGIN ?? "").replace(/\/$/, "");
}

/**
 * 向所有开启该日报的用户发送邮件（报告须已由定时或手动生成）。
 */
export async function sendDailyDigestEmailsForTopic(topicTitle: string, dailyKey: string): Promise<void> {
  const sender = await getEmailSender();
  if (!sender) {
    logger.warn("email", "日报邮件跳过：未配置邮件驱动（SMTP 或 Resend）", { topicTitle, dailyKey });
    return;
  }

  const digest = await readDigest(TOPIC_TASK_BASE_DIR, topicTitle);
  if (!digest?.content?.trim()) {
    logger.info("email", "日报邮件跳过：当前无可读报告（可能尚未生成或目录为空）", { topicTitle, dailyKey });
    return;
  }

  const subscribers = await listEnabledSubscribersWithEmailForDailyKey(dailyKey);
  if (subscribers.length === 0) {
    logger.debug("email", "日报邮件跳过：无开启订阅的用户", { dailyKey });
    return;
  }

  const appUrl = appBaseUrl();
  const subject = `RssAny 日报 · ${topicTitle} · ${digest.date}`;
  let ok = 0;
  for (const { email } of subscribers) {
    try {
      const html = await renderResearch({
        title: `日报 · ${topicTitle}`,
        markdown: digest.content,
        generatedAt: new Date().toISOString(),
        appUrl,
      });
      await sender.send({ to: email, subject, html });
      ok += 1;
    } catch (err) {
      logger.error("email", "日报邮件单封失败", {
        topicTitle,
        to: email,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  logger.info("email", "日报邮件批次完成", { topicTitle, dailyKey, sent: ok, subscribers: subscribers.length });
}
