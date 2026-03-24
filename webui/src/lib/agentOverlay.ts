import { writable } from 'svelte/store';

/** Ask / NewsClaw 浮层开关；由根 layout 以小窗 + 模糊衬底渲染，不依赖路由。 */
export const agentOverlayOpen = writable(false);
