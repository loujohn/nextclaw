// ── 上下文预算管理常量 ──────────────────────────────────────────
// 默认上下文窗口 200K tokens（主流大模型常见值）
const DEFAULT_CONTEXT_TOKENS = 200_000;
// 为模型输出保留的最小 token 数
const DEFAULT_RESERVE_TOKENS_FLOOR = 20_000;
// 软阈值：预留给下一轮用户输入的缓冲
const DEFAULT_SOFT_THRESHOLD_TOKENS = 4_000;
// 粗略的字符→token 比值（英文约 4:1，中文约 2:1，取保守值）
const DEFAULT_CHARS_PER_TOKEN = 4;

// ── 工具结果截断 ────────────────────────────────────────────────
// 单条工具结果最多占用上下文窗口的 30%
const MAX_TOOL_RESULT_CONTEXT_SHARE = 0.3;
// 工具结果硬上限 400K 字符
const HARD_MAX_TOOL_RESULT_CHARS = 400_000;
const TOOL_RESULT_TRUNCATION_SUFFIX =
  "\n\n⚠️ [Tool result truncated to fit input context budget.]";
const CONTEXT_TRUNCATION_SUFFIX = "\n\n⚠️ [Context truncated to fit model input budget.]";

// ── 最小保留字符数 ──────────────────────────────────────────────
// 系统提示词和用户消息即使压缩也至少保留这么多字符
const MIN_SYSTEM_KEEP_CHARS = 2_000;
const MIN_USER_KEEP_CHARS = 1_000;

// ── 压缩摘要 & 记忆刷写 ────────────────────────────────────────
// 当已用 token 超过预算的 75% 时触发记忆刷写提醒
// 参考：OpenClaw 使用 ~75-80% 作为消息占比阈值
const NEAR_BUDGET_THRESHOLD_RATIO = 0.75;
// 压缩摘要最大字符数（~1000 tokens，足以概述被裁剪的历史对话）
const COMPACTION_MAX_CHARS = 4_000;
// 每条被裁剪消息在摘要中的最大字符片段（~50 tokens，保留核心语义）
const COMPACTION_PER_MESSAGE_CHARS = 200;

type RuntimeMessage = Record<string, unknown>;

export type InputBudgetPruneResult = {
  messages: RuntimeMessage[];
  estimatedTokens: number;
  budgetTokens: number;
  droppedHistoryCount: number;
  truncatedToolResultCount: number;
  truncatedSystemPrompt: boolean;
  truncatedUserMessage: boolean;
  compactionSummary: string | null;
  nearBudgetThreshold: boolean;
};

export class InputBudgetPruner {
  prune(params: {
    messages: RuntimeMessage[];
    contextTokens?: number | null;
    reserveTokensFloor?: number;
    softThresholdTokens?: number;
  }): InputBudgetPruneResult {
    const contextTokens = sanitizePositiveInt(params.contextTokens) ?? DEFAULT_CONTEXT_TOKENS;
    const reserveTokens = sanitizeNonNegativeInt(params.reserveTokensFloor) ?? DEFAULT_RESERVE_TOKENS_FLOOR;
    const softThreshold = sanitizeNonNegativeInt(params.softThresholdTokens) ?? DEFAULT_SOFT_THRESHOLD_TOKENS;
    const budgetTokens = Math.max(1, contextTokens - reserveTokens - softThreshold);

    const work = params.messages.map(cloneMessage);
    const maxToolResultChars = Math.min(
      HARD_MAX_TOOL_RESULT_CHARS,
      Math.max(2_000, Math.floor(contextTokens * MAX_TOOL_RESULT_CONTEXT_SHARE * DEFAULT_CHARS_PER_TOKEN))
    );

    let truncatedToolResultCount = 0;
    for (let index = 0; index < work.length; index += 1) {
      const message = work[index];
      if (message.role !== "tool") {
        continue;
      }
      const content = typeof message.content === "string" ? message.content : "";
      if (!content || content.length <= maxToolResultChars) {
        continue;
      }
      work[index] = {
        ...message,
        content: truncateText(content, maxToolResultChars, TOOL_RESULT_TRUNCATION_SUFFIX)
      };
      truncatedToolResultCount += 1;
    }

    const normalized = sanitizeHistoricalToolProtocol(work);
    let droppedHistoryCount = work.length - normalized.length;
    work.splice(0, work.length, ...normalized);

    const droppedMessages: RuntimeMessage[] = [];
    while (estimateTokens(work) > budgetTokens && work.length > 2) {
      const dropped = work.splice(1, 1);
      droppedMessages.push(...dropped);
      droppedHistoryCount += 1;
    }

    let truncatedSystemPrompt = false;
    let truncatedUserMessage = false;
    let guard = 0;
    while (estimateTokens(work) > budgetTokens && guard < 8) {
      guard += 1;

      const systemIndex = work.findIndex((message) => message.role === "system");
      if (systemIndex >= 0) {
        const systemContent = typeof work[systemIndex].content === "string" ? work[systemIndex].content : "";
        if (systemContent.length > MIN_SYSTEM_KEEP_CHARS) {
          work[systemIndex] = {
            ...work[systemIndex],
            content: truncateText(systemContent, Math.max(MIN_SYSTEM_KEEP_CHARS, Math.floor(systemContent.length * 0.8)))
          };
          truncatedSystemPrompt = true;
          continue;
        }
      }

      const userIndex = findLastIndex(work, (message) => message.role === "user");
      if (userIndex >= 0) {
        const userContent = typeof work[userIndex].content === "string" ? work[userIndex].content : "";
        if (userContent.length > MIN_USER_KEEP_CHARS) {
          work[userIndex] = {
            ...work[userIndex],
            content: truncateText(userContent, Math.max(MIN_USER_KEEP_CHARS, Math.floor(userContent.length * 0.8)))
          };
          truncatedUserMessage = true;
          continue;
        }
      }

      break;
    }

    let compactionSummary: string | null = null;
    if (droppedMessages.length > 0) {
      compactionSummary = buildCompactionSummary(droppedMessages);
      if (compactionSummary) {
        const compactionMessage: RuntimeMessage = {
          role: "system",
          content: compactionSummary
        };
        const compactionTokens = estimateTokens([compactionMessage]);
        if (estimateTokens(work) + compactionTokens <= budgetTokens) {
          work.splice(1, 0, compactionMessage);
        }
      }
    }

    const finalEstimated = estimateTokens(work);
    const nearBudgetThreshold = finalEstimated > budgetTokens * NEAR_BUDGET_THRESHOLD_RATIO;

    return {
      messages: work,
      estimatedTokens: finalEstimated,
      budgetTokens,
      droppedHistoryCount,
      truncatedToolResultCount,
      truncatedSystemPrompt,
      truncatedUserMessage,
      compactionSummary,
      nearBudgetThreshold
    };
  }
}

function sanitizePositiveInt(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  const normalized = Math.floor(value);
  return normalized > 0 ? normalized : null;
}

function sanitizeNonNegativeInt(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  const normalized = Math.floor(value);
  return normalized >= 0 ? normalized : null;
}

function cloneMessage(message: RuntimeMessage): RuntimeMessage {
  const cloned: RuntimeMessage = {};
  for (const [key, value] of Object.entries(message)) {
    cloned[key] = deepCloneValue(value);
  }
  return cloned;
}

function deepCloneValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => deepCloneValue(item));
  }
  if (value && typeof value === "object") {
    const cloned: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      cloned[key] = deepCloneValue(nested);
    }
    return cloned;
  }
  return value;
}

function sanitizeHistoricalToolProtocol(messages: RuntimeMessage[]): RuntimeMessage[] {
  const activeToolChainStart = findActiveToolChainStart(messages);
  const sanitized: RuntimeMessage[] = [];

  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index];
    if (activeToolChainStart >= 0 && index >= activeToolChainStart) {
      sanitized.push(message);
      continue;
    }

    if (message.role === "tool") {
      continue;
    }

    if (message.role === "assistant" && hasToolCalls(message)) {
      const stripped = stripAssistantToolCallFields(message);
      if (hasRenderableContent(stripped.content)) {
        sanitized.push(stripped);
      }
      continue;
    }

    sanitized.push(message);
  }

  return sanitized;
}

function findActiveToolChainStart(messages: RuntimeMessage[]): number {
  let index = messages.length - 1;
  while (index >= 0 && messages[index].role === "tool") {
    index -= 1;
  }
  if (index < 0) {
    return -1;
  }
  const candidate = messages[index];
  if (candidate.role === "assistant" && hasToolCalls(candidate)) {
    return index;
  }
  return -1;
}

function hasToolCalls(message: RuntimeMessage): boolean {
  const toolCalls = message.tool_calls;
  return Array.isArray(toolCalls) && toolCalls.length > 0;
}

function stripAssistantToolCallFields(message: RuntimeMessage): RuntimeMessage {
  const stripped: RuntimeMessage = {};
  for (const [key, value] of Object.entries(message)) {
    if (key === "tool_calls" || key === "reasoning_content") {
      continue;
    }
    stripped[key] = value;
  }
  return stripped;
}

function hasRenderableContent(content: unknown): boolean {
  if (typeof content === "string") {
    return content.trim().length > 0;
  }
  return estimateChars(content) > 0;
}

function estimateTokens(messages: RuntimeMessage[]): number {
  const totalChars = messages.reduce((sum, message) => sum + estimateChars(message), 0);
  return Math.ceil(totalChars / DEFAULT_CHARS_PER_TOKEN);
}

function estimateChars(value: unknown): number {
  if (typeof value === "string") {
    return value.length;
  }
  if (typeof value === "number") {
    return String(value).length;
  }
  if (typeof value === "boolean") {
    return value ? 4 : 5;
  }
  if (!value) {
    return 0;
  }
  if (Array.isArray(value)) {
    return value.reduce((sum, item) => sum + estimateChars(item), 0);
  }
  if (typeof value === "object") {
    return Object.entries(value).reduce((sum, [key, nested]) => sum + key.length + estimateChars(nested), 0);
  }
  return 0;
}

function truncateText(text: string, maxChars: number, suffix = CONTEXT_TRUNCATION_SUFFIX): string {
  if (text.length <= maxChars) {
    return text;
  }
  const safeMax = Math.max(64, maxChars);
  if (safeMax <= suffix.length + 16) {
    return text.slice(0, safeMax);
  }
  const keep = safeMax - suffix.length;
  return `${text.slice(0, keep).trimEnd()}${suffix}`;
}

function findLastIndex<T>(items: T[], predicate: (item: T) => boolean): number {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (predicate(items[index])) {
      return index;
    }
  }
  return -1;
}

function buildCompactionSummary(droppedMessages: RuntimeMessage[]): string | null {
  const entries: string[] = [];
  for (const message of droppedMessages) {
    const role = String(message.role ?? "unknown");
    if (role === "tool" || role === "system") continue;
    const raw = typeof message.content === "string" ? message.content : "";
    if (!raw.trim()) continue;
    const snippet = raw.length > COMPACTION_PER_MESSAGE_CHARS
      ? raw.slice(0, COMPACTION_PER_MESSAGE_CHARS).trimEnd() + "…"
      : raw;
    entries.push(`[${role}] ${snippet}`);
  }
  if (entries.length === 0) return null;
  const body = entries.join("\n");
  const trimmed = body.length > COMPACTION_MAX_CHARS
    ? body.slice(0, COMPACTION_MAX_CHARS).trimEnd() + "\n…(truncated)"
    : body;
  return [
    `[Conversation Compaction — ${droppedMessages.length} earlier messages were pruned to fit context budget]`,
    trimmed,
    "",
    "[Memory Flush Reminder] Earlier messages have been removed from context.",
    "If anything important from the earlier conversation has not been written to memory files,",
    "use write_file to save it to memory/YYYY-MM-DD.md or MEMORY.md now before it is lost permanently."
  ].join("\n");
}
