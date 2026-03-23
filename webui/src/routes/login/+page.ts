import { redirect } from '@sveltejs/kit';

/** 登录已合并至首页，保留旧链接与书签 */
export function load({ url }: { url: URL }) {
  const q = url.searchParams.toString();
  throw redirect(302, q ? `/?${q}` : '/');
}
