// LLM 配置：config.json 的 llm 块优先，其次环境变量

import { existsSync, readFileSync, statSync } from "node:fs";
import "dotenv/config";
import { CONFIG_PATH } from "../config/paths.js";

/** LLM 配置（文件、环境变量或调用方传入） */
export interface LLMConfig {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}

const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_MODEL = "gpt-4o-mini";

interface FileLlmCache {
  mtimeMs: number;
  llm: Partial<LLMConfig>;
}

let fileCache: FileLlmCache | null = null;

/** 配置或外部写入后调用，使下次 getLLMConfig 重新读盘 */
export function invalidateLLMConfigCache(): void {
  fileCache = null;
}

function readLlmFromFileSync(): Partial<LLMConfig> {
  if (!existsSync(CONFIG_PATH)) return {};
  try {
    const st = statSync(CONFIG_PATH);
    if (fileCache && fileCache.mtimeMs === st.mtimeMs) return fileCache.llm;
    const raw = readFileSync(CONFIG_PATH, "utf-8");
    const j = JSON.parse(raw) as { llm?: unknown };
    const llmRaw = j?.llm;
    const llm: Partial<LLMConfig> = {};
    if (llmRaw && typeof llmRaw === "object") {
      const o = llmRaw as Record<string, unknown>;
      if (typeof o.apiKey === "string" && o.apiKey.length > 0) llm.apiKey = o.apiKey;
      if (typeof o.baseUrl === "string" && o.baseUrl.trim()) llm.baseUrl = o.baseUrl.trim();
      if (typeof o.model === "string" && o.model.trim()) llm.model = o.model.trim();
    }
    fileCache = { mtimeMs: st.mtimeMs, llm };
    return llm;
  } catch {
    return {};
  }
}

/** 合并文件与环境变量：文件中的非空字段优先 */
export function getLLMConfig(): Required<Pick<LLMConfig, "baseUrl" | "model">> & Pick<LLMConfig, "apiKey"> {
  const file = readLlmFromFileSync();
  const apiKey = file.apiKey ?? process.env.OPENAI_API_KEY;
  const baseUrl = file.baseUrl ?? process.env.OPENAI_BASE_URL ?? DEFAULT_BASE_URL;
  const model = file.model ?? process.env.OPENAI_MODEL ?? DEFAULT_MODEL;
  return { apiKey, baseUrl, model };
}
