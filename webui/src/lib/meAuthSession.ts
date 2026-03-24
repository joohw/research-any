import { browser } from '$app/environment';
import { goto } from '$app/navigation';
import { resetMeStores } from '$lib/meAreaStore';

/** 会话失效：清 me 区与 Agent 侧用户标记，并回首页（仅浏览器） */
export async function clearMeSessionAndRedirectHome(): Promise<void> {
  resetMeStores();
  if (browser) await goto('/', { replaceState: true });
}

/** 响应为 401/403 时视为未登录，清状态并回首页 */
export async function redirectIfUnauthorizedResponse(res: Response): Promise<boolean> {
  if (res.status !== 401 && res.status !== 403) return false;
  await clearMeSessionAndRedirectHome();
  return true;
}
