// OpenClaw Gateway：OpenResponses HTTP（POST /v1/responses），与本地 pi-agent 并行作为聊天后端候选项
// 概览：https://openclawdoc.com/docs/getting-started/what-is-openclaw · Gateway API：https://docs.molt.bot/gateway/openresponses-http-api

export type OpenClawHistoryMessage = {
  role: "user" | "assistant";
  content: string;
};

function normalizeGatewayBase(url: string): string {
  return url.replace(/\/+$/, "");
}

export function isOpenClawConfigured(): boolean {
  const url = process.env.OPENCLAW_GATEWAY_URL?.trim();
  const token = process.env.OPENCLAW_GATEWAY_TOKEN?.trim();
  return Boolean(url && token);
}

export function getOpenClawGatewayBaseUrl(): string | null {
  const url = process.env.OPENCLAW_GATEWAY_URL?.trim();
  if (!url) return null;
  return normalizeGatewayBase(url);
}

export function getOpenClawAuthHeaders(): Record<string, string> | null {
  const token = process.env.OPENCLAW_GATEWAY_TOKEN?.trim();
  if (!token) return null;
  return { Authorization: `Bearer ${token}` };
}

export function getOpenClawAgentId(): string {
  return process.env.OPENCLAW_AGENT_ID?.trim() || "main";
}

/** 构建 OpenResponses `input`：多轮 user/assistant + 当前用户句 */
export function buildOpenResponsesInput(
  history: OpenClawHistoryMessage[],
  prompt: string,
): Array<Record<string, unknown>> {
  const items: Array<Record<string, unknown>> = [];
  for (const m of history) {
    const text = m.content ?? "";
    if (m.role === "user") {
      items.push({
        type: "message",
        role: "user",
        content: [{ type: "input_text", text }],
      });
    } else {
      items.push({
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text }],
      });
    }
  }
  items.push({
    type: "message",
    role: "user",
    content: [{ type: "input_text", text: prompt }],
  });
  return items;
}

type UsageOut = {
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
  totalTokens: number;
  cost?: { total: number };
};

function mapUsage(raw: unknown): UsageOut | null {
  if (!raw || typeof raw !== "object") return null;
  const u = raw as Record<string, unknown>;
  const input = Number(u.input_tokens ?? u.input ?? u.prompt_tokens ?? 0) || 0;
  const output = Number(u.output_tokens ?? u.output ?? u.completion_tokens ?? 0) || 0;
  const total =
    Number(u.total_tokens) ||
    (input || output ? input + output : 0);
  if (input === 0 && output === 0 && total === 0) return null;
  return {
    input,
    output,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: total,
    cost: undefined,
  };
}

function routeDeltaType(data: Record<string, unknown>): "text" | "reasoning" | null {
  const t = String(data.type ?? "");
  if (t === "response.output_text.delta") return "text";
  if (t.includes("reasoning") && t.endsWith(".delta")) return "reasoning";
  return null;
}

function extractDeltaText(data: Record<string, unknown>): string {
  const d = data.delta;
  if (typeof d === "string") return d;
  return "";
}

export async function streamOpenClawResponses(params: {
  userId: string;
  history: OpenClawHistoryMessage[];
  prompt: string;
  send: (event: string, data: unknown) => void;
}): Promise<void> {
  const { userId, history, prompt, send } = params;
  const base = getOpenClawGatewayBaseUrl();
  const auth = getOpenClawAuthHeaders();
  if (!base || !auth) {
    send("error", { message: "OpenClaw Gateway 未配置（OPENCLAW_GATEWAY_URL / OPENCLAW_GATEWAY_TOKEN）" });
    return;
  }

  const url = `${base}/v1/responses`;
  const body = {
    model: process.env.OPENCLAW_MODEL?.trim() || "openclaw",
    stream: true,
    user: userId,
    input: buildOpenResponsesInput(history, prompt),
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      ...auth,
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      "x-openclaw-agent-id": getOpenClawAgentId(),
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    let msg = `OpenClaw Gateway HTTP ${res.status}`;
    try {
      const err = (await res.json()) as { error?: { message?: string } };
      if (err?.error?.message) msg = err.error.message;
    } catch {
      const t = await res.text().catch(() => "");
      if (t) msg = t.slice(0, 500);
    }
    send("error", { message: msg });
    return;
  }

  if (!res.body) {
    send("error", { message: "OpenClaw Gateway 无响应体" });
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let eventName = "";
  const dataLines: string[] = [];
  let sawCompleted = false;
  let sentError = false;

  const flush = () => {
    if (dataLines.length === 0) return;
    const raw = dataLines.join("\n");
    dataLines.length = 0;
    const ev = eventName;
    eventName = "";
    if (raw === "[DONE]") return;
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return;
    }
    const t = String(data.type ?? "");
    if (ev === "error" || t === "error") {
      sentError = true;
      const msg =
        typeof data.message === "string"
          ? data.message
          : (data.error as { message?: string } | undefined)?.message ?? "OpenClaw 错误";
      send("error", { message: msg });
      return;
    }
    if (t === "response.failed") {
      sentError = true;
      const msg =
        typeof data.message === "string"
          ? data.message
          : String((data as { error?: { message?: string } }).error?.message ?? "response.failed");
      send("error", { message: msg });
      return;
    }

    const routed = routeDeltaType(data);
    if (routed === "text") {
      const delta = extractDeltaText(data);
      if (delta) send("text_delta", { delta });
      return;
    }
    if (routed === "reasoning") {
      const delta = extractDeltaText(data);
      if (delta) send("reasoning_delta", { delta });
      return;
    }

    if (t === "response.completed") {
      sawCompleted = true;
      const resp = data.response as Record<string, unknown> | undefined;
      const usage = mapUsage(resp?.usage) ?? mapUsage(data.usage);
      send("done", usage ? { usage } : {});
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.replace(/\r$/, "");
        if (trimmed === "") {
          flush();
          continue;
        }
        if (trimmed.startsWith("event:")) {
          eventName = trimmed.slice(6).trim();
        } else if (trimmed.startsWith("data:")) {
          dataLines.push(trimmed.slice(5).trimStart());
        }
      }
    }
    if (buffer.trim()) {
      const trimmed = buffer.replace(/\r$/, "");
      if (trimmed.startsWith("data:")) dataLines.push(trimmed.slice(5).trimStart());
      flush();
    }
    if (!sawCompleted && !sentError) send("done", {});
  } catch (err) {
    send("error", { message: err instanceof Error ? err.message : String(err) });
  }
}
