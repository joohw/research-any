import { writable } from 'svelte/store';

/** Ask / NewsClaw 全屏层开关；由根 layout 渲染，不依赖路由。 */
export const agentOverlayOpen = writable(false);
