// 用户 Agent 沙盒根目录默认 Markdown：首次使用前自动创建（仅缺省时写入，不覆盖已有文件）

import { access, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { userAgentSandboxRoot } from "../config/paths.js";
import { getUserById, type UserRow } from "../db/users.js";

/** 追加到系统提示：说明三份文件用途（与 sandbox 工具路径一致，相对用户沙盒根） */
export const USER_SANDBOX_PROFILE_PROMPT = `

## User sandbox profile files (at your workspace root, one per user; created automatically if missing)
Paths are relative to your sandbox root (same as the sandbox tool). Use sandbox read | write | replace | list.
- user.md — About the user: how to address them, background, preferences. Read when personalizing; update when the user shares stable facts about themselves.
- soul.md — Your persona and tone for this user (style, principles, boundaries). Follow it when present.
- memories.md — Long-term facts and preferences across sessions. Read when context matters; update when the user asks to remember something durable.`;

function buildInitialUserMd(user: UserRow | null): string {
  if (!user) {
    return `# User

关于当前用户：称呼、背景、偏好等（由用户自行维护）。

`;
  }
  const lines = [
    "# User",
    "",
    "来自账号资料（首次创建时写入）；可与助手持续补充称呼、背景、偏好等。",
    "",
  ];
  if (user.display_name?.trim()) {
    lines.push(`- **显示名**：${user.display_name.trim()}`);
  }
  lines.push(`- **邮箱**：${user.email}`);
  if (user.avatar_url?.trim()) {
    lines.push(`- **头像**：${user.avatar_url.trim()}`);
  }
  lines.push("");
  return lines.join("\n");
}

const DEFAULT_FILES: Record<string, string> = {
  "soul.md": `# Soul

助手的风格与行为准则（面向当前用户）：语气、原则与边界等（可长期生效）。

`,
  "memories.md": `# Memories

长期记忆：重要事实、偏好与约定（跨会话；由用户与助手按需更新）。

`,
};

/** 确保当前用户沙盒根目录存在，且默认存在 user.md / soul.md / memories.md（不覆盖已有文件） */
export async function ensureUserSandboxProfileFiles(userId: string): Promise<void> {
  const root = userAgentSandboxRoot(userId);
  await mkdir(root, { recursive: true });
  const userAbs = join(root, "user.md");
  try {
    await access(userAbs);
  } catch {
    const row = await getUserById(userId);
    await writeFile(userAbs, buildInitialUserMd(row), "utf-8");
  }
  for (const [name, content] of Object.entries(DEFAULT_FILES)) {
    const abs = join(root, name);
    try {
      await access(abs);
    } catch {
      await writeFile(abs, content, "utf-8");
    }
  }
}
