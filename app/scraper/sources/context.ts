import { PLUGIN_HOST_DEPS } from "../../plugins/hostDeps.js";
import type { SourceContext } from "./types.js";

/** 构造带 deps 的信源上下文（抓取、preCheck、插件 fetchItems 均须使用） */
export function buildSourceContext(partial: {
  cacheDir?: string;
  headless?: boolean;
  proxy?: string;
}): SourceContext {
  return { ...partial, deps: PLUGIN_HOST_DEPS };
}
