import { supabase } from "./client.js";
import { loadDailyReports } from "../config/loadDailyReports.js";

/** PostgREST / Postgres：表尚未创建或未进入 schema cache */
export function isMissingSubscriptionsTableError(error: { message?: string; code?: string } | null | undefined): boolean {
  if (!error?.message) return false;
  const m = error.message.toLowerCase();
  if (m.includes("schema cache") && m.includes("user_daily_subscriptions")) return true;
  if (m.includes("user_daily_subscriptions") && (m.includes("does not exist") || m.includes("relation"))) return true;
  const code = (error.code ?? "").toUpperCase();
  if (code === "42P01") return true;
  return false;
}

const SUBSCRIPTIONS_TABLE_HELP =
  "请先在本机/线上 Supabase 执行项目根目录 supabase-schema.sql 中 user_daily_subscriptions 表的 CREATE TABLE 语句。";

export function subscriptionsTableNotReadyMessage(): string {
  return SUBSCRIPTIONS_TABLE_HELP;
}

/** 表是否存在且可查询（用于 API 返回 dbReady；开关持久化依赖此表） */
export async function probeDailySubscriptionsTableAvailable(): Promise<boolean> {
  const { error } = await supabase.from("user_daily_subscriptions").select("user_id").limit(1);
  if (error && isMissingSubscriptionsTableError(error)) return false;
  return true;
}

/** 新用户或首次访问时：为缺失的 key 插入一行，enabled 取自 JSON 的 defaultEnabled */
export async function ensureDailySubscriptionsForUser(userId: string): Promise<void> {
  if (!userId.trim()) return;
  const defs = await loadDailyReports();
  const { data: existing, error: selErr } = await supabase
    .from("user_daily_subscriptions")
    .select("daily_key")
    .eq("user_id", userId);
  if (selErr) {
    if (isMissingSubscriptionsTableError(selErr)) return;
    throw new Error(`ensureDailySubscriptionsForUser: ${selErr.message}`);
  }
  const have = new Set((existing ?? []).map((r) => (r as { daily_key: string }).daily_key));
  const toInsert = defs
    .filter((d) => !have.has(d.key))
    .map((d) => ({
      user_id: userId,
      daily_key: d.key,
      enabled: d.defaultEnabled,
    }));
  if (toInsert.length === 0) return;
  const { error: insErr } = await supabase.from("user_daily_subscriptions").insert(toInsert);
  if (insErr) {
    if (isMissingSubscriptionsTableError(insErr)) return;
    throw new Error(`ensureDailySubscriptionsForUser: ${insErr.message}`);
  }
}

function defaultSubscriptionMapFromDefs(defs: Awaited<ReturnType<typeof loadDailyReports>>): Map<string, boolean> {
  return new Map(defs.map((d) => [d.key, d.defaultEnabled]));
}

export async function getDailySubscriptionMap(userId: string): Promise<Map<string, boolean>> {
  const defs = await loadDailyReports();
  if (!userId.trim()) return defaultSubscriptionMapFromDefs(defs);

  await ensureDailySubscriptionsForUser(userId);
  const { data, error } = await supabase
    .from("user_daily_subscriptions")
    .select("daily_key, enabled")
    .eq("user_id", userId);
  if (error) {
    if (isMissingSubscriptionsTableError(error)) return defaultSubscriptionMapFromDefs(defs);
    throw new Error(`getDailySubscriptionMap: ${error.message}`);
  }
  const m = new Map<string, boolean>();
  for (const r of data ?? []) {
    const row = r as { daily_key: string; enabled: boolean };
    m.set(row.daily_key, row.enabled === true);
  }
  return m;
}

export async function setDailySubscription(userId: string, dailyKey: string, enabled: boolean): Promise<void> {
  const defs = await loadDailyReports();
  if (!defs.some((d) => d.key === dailyKey)) throw new Error("无效的 daily_key");
  await ensureDailySubscriptionsForUser(userId);
  const { error } = await supabase.from("user_daily_subscriptions").upsert(
    { user_id: userId, daily_key: dailyKey, enabled },
    { onConflict: "user_id,daily_key" },
  );
  if (error) {
    if (isMissingSubscriptionsTableError(error)) {
      throw new Error(subscriptionsTableNotReadyMessage());
    }
    throw new Error(`setDailySubscription: ${error.message}`);
  }
}

export async function listUserIdsWithEnabledDailySubscription(): Promise<string[]> {
  const { data, error } = await supabase.from("user_daily_subscriptions").select("user_id").eq("enabled", true);
  if (error) {
    if (isMissingSubscriptionsTableError(error)) return [];
    throw new Error(`listUserIdsWithEnabledDailySubscription: ${error.message}`);
  }
  const ids = new Set<string>();
  for (const r of data ?? []) {
    const id = (r as { user_id: string }).user_id;
    if (typeof id === "string" && id) ids.add(id);
  }
  return [...ids];
}

/** 至少开启一项系统日报的用户（topics 调度） */
export async function listUserIdsWithTopicScheduling(): Promise<string[]> {
  return listUserIdsWithEnabledDailySubscription();
}

/** 是否存在至少一名用户开启该 daily_key（定时生成前判断，避免无人订阅仍跑 Agent） */
export async function hasAnyEnabledSubscriberForDailyKey(dailyKey: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("user_daily_subscriptions")
    .select("user_id")
    .eq("daily_key", dailyKey)
    .eq("enabled", true)
    .limit(1);
  if (error) {
    if (isMissingSubscriptionsTableError(error)) return false;
    throw new Error(`hasAnyEnabledSubscriberForDailyKey: ${error.message}`);
  }
  return (data?.length ?? 0) > 0;
}

/** 开启该日报且可发邮件的用户（users.email） */
export async function listEnabledSubscribersWithEmailForDailyKey(
  dailyKey: string
): Promise<{ userId: string; email: string }[]> {
  const { data: subs, error } = await supabase
    .from("user_daily_subscriptions")
    .select("user_id")
    .eq("daily_key", dailyKey)
    .eq("enabled", true);
  if (error) {
    if (isMissingSubscriptionsTableError(error)) return [];
    throw new Error(`listEnabledSubscribersWithEmailForDailyKey: ${error.message}`);
  }
  const userIds = (subs ?? [])
    .map((r) => (r as { user_id: string }).user_id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
  if (userIds.length === 0) return [];
  const { data: users, error: uerr } = await supabase.from("users").select("id, email").in("id", userIds);
  if (uerr) throw new Error(`listEnabledSubscribersWithEmailForDailyKey(users): ${uerr.message}`);
  const out: { userId: string; email: string }[] = [];
  for (const u of users ?? []) {
    const row = u as { id: string; email: string };
    const email = typeof row.email === "string" ? row.email.trim() : "";
    if (row.id && email.includes("@")) out.push({ userId: row.id, email });
  }
  return out;
}
