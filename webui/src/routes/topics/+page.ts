import { redirect } from '@sveltejs/kit';

/** 旧路由：/topics 根路径 */
export function load() {
  throw redirect(302, '/me');
}
