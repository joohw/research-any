// 全员共享的日报定义（prompt / 周期等），每人仅通过 user_daily_subscriptions 开关区分

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const CONFIG_DIR = dirname(fileURLToPath(import.meta.url));
const DAILY_REPORTS_JSON = join(CONFIG_DIR, "dailyReports.json");

export interface DailyReportDef {
  key: string;
  title: string;
  description: string;
  prompt: string;
  refresh: number;
  defaultEnabled: boolean;
}

let cached: DailyReportDef[] | null = null;

const DEFAULT_REPORTS: DailyReportDef[] = [
  {
    key: "ai-general",
    title: "AI通用资讯",
    description: "汇总订阅中与 AI、大模型、产品与论文相关的近期动态",
    prompt:
      "侧重模型与推理、产品与开源、论文与评测、行业与政策；用中文输出，突出对读者有决策价值的信息。",
    refresh: 1,
    defaultEnabled: true,
  },
];

function normalizeReports(raw: unknown): DailyReportDef[] {
  if (!raw || typeof raw !== "object") return [];
  const reports = (raw as { reports?: unknown }).reports;
  if (!Array.isArray(reports)) return [];
  const out: DailyReportDef[] = [];
  for (const r of reports) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    const key = typeof o.key === "string" && o.key.trim() ? o.key.trim() : "";
    const title = typeof o.title === "string" && o.title.trim() ? o.title.trim() : "";
    if (!key || !title) continue;
    let refresh = 1;
    if (typeof o.refresh === "number" && Number.isFinite(o.refresh) && o.refresh >= 1) {
      refresh = Math.floor(o.refresh);
    }
    out.push({
      key,
      title,
      description: typeof o.description === "string" ? o.description : "",
      prompt: typeof o.prompt === "string" ? o.prompt : "",
      refresh,
      defaultEnabled: o.defaultEnabled === true,
    });
  }
  return out;
}

export async function loadDailyReports(): Promise<DailyReportDef[]> {
  if (cached) return cached;
  try {
    const raw = await readFile(DAILY_REPORTS_JSON, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    const list = normalizeReports(parsed);
    cached = list.length > 0 ? list : DEFAULT_REPORTS;
  } catch {
    cached = DEFAULT_REPORTS;
  }
  return cached;
}

export async function getDailyReportByTitle(topicTitle: string): Promise<DailyReportDef | null> {
  const trimmed = topicTitle.trim();
  if (!trimmed) return null;
  const reports = await loadDailyReports();
  return reports.find((r) => r.title === trimmed) ?? null;
}

export async function getDailyReportByKey(key: string): Promise<DailyReportDef | null> {
  const k = key.trim();
  if (!k) return null;
  const reports = await loadDailyReports();
  return reports.find((r) => r.key === k) ?? null;
}

export async function getSystemReportTitles(): Promise<Set<string>> {
  const reports = await loadDailyReports();
  return new Set(reports.map((r) => r.title));
}
