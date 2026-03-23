// 内存 OTP 存储：6 位验证码，10 分钟有效，单次使用
// 单进程足够；多进程场景可迁移到 Redis/Supabase

const store = new Map<string, { code: string; expiresAt: number }>();

const OTP_TTL_MS = 10 * 60 * 1000;
const COOLDOWN_MS = 60 * 1000; // 1 分钟内不允许重复发送
const cooldowns = new Map<string, number>(); // email → nextAllowedAt

function normalize(email: string): string {
  return email.toLowerCase().trim();
}

/** 生成并存储 OTP，返回验证码字符串。若在冷却期内抛出错误。 */
export function createOtp(email: string): string {
  const key = normalize(email);

  const nextAllowed = cooldowns.get(key) ?? 0;
  if (Date.now() < nextAllowed) {
    const waitSec = Math.ceil((nextAllowed - Date.now()) / 1000);
    throw new Error(`请等待 ${waitSec} 秒后再重试`);
  }

  // 清理过期条目
  const now = Date.now();
  for (const [k, v] of store) {
    if (v.expiresAt < now) store.delete(k);
  }
  for (const [k, v] of cooldowns) {
    if (v < now) cooldowns.delete(k);
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));
  store.set(key, { code, expiresAt: now + OTP_TTL_MS });
  cooldowns.set(key, now + COOLDOWN_MS);
  return code;
}

/** 校验 OTP，成功后立即删除（单次有效）。返回是否通过。 */
export function verifyOtp(email: string, code: string): boolean {
  const key = normalize(email);
  const entry = store.get(key);
  if (!entry) return false;
  if (entry.expiresAt < Date.now()) { store.delete(key); return false; }
  if (entry.code !== code.trim()) return false;
  store.delete(key);
  return true;
}
