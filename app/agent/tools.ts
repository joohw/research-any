// Agent 工具：从 definitions 转换

import type { AgentTool } from "@mariozechner/pi-agent-core";
import { toAgentTools } from "./tools/definitions.js";

/** 构建带用户沙箱隔离的 Agent 工具；userId 缺省时沙箱工具不可用 */
export function buildFeedAgentTools(userId?: string): AgentTool[] {
  return toAgentTools(userId) as AgentTool[];
}
