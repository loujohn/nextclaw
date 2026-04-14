import type { ChatMessageView, ChatToolCallView } from "../../shared/ui-models";

export type ChatToolResultView = {
  id: string;
  name: string;
  output: string;
  toolCallId?: string;
  timestamp?: string;
};

export type ChatToolStepView = {
  key: string;
  name: string;
  toolCallId?: string;
  call?: ChatToolCallView;
  result?: ChatToolResultView;
};

export type ChatDisplayMessage = {
  key: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp?: string;
  attachments: ChatMessageView["attachments"];
  reasoning?: string;
  replyStatus?: ChatMessageView["replyStatus"];
  toolCalls: ChatToolCallView[];
  toolResults: ChatToolResultView[];
  toolSteps: ChatToolStepView[];
  sourceMessageIds: string[];
};

function mergeReplyStatus(
  existing: ChatMessageView["replyStatus"],
  incoming: ChatMessageView["replyStatus"]
): ChatMessageView["replyStatus"] {
  return incoming ?? existing;
}

function buildToolSteps(toolCalls: ChatToolCallView[], toolResults: ChatToolResultView[]): ChatToolStepView[] {
  const resultsById = new Map<string, ChatToolResultView>();
  const unpairedResults: ChatToolResultView[] = [];

  for (const result of toolResults) {
    const toolCallId = result.toolCallId?.trim();
    if (toolCallId) {
      resultsById.set(toolCallId, result);
      continue;
    }
    unpairedResults.push(result);
  }

  const steps: ChatToolStepView[] = toolCalls.map((toolCall, index) => {
    const toolCallId = toolCall.id?.trim();
    const matchedResult = toolCallId ? resultsById.get(toolCallId) : undefined;
    if (toolCallId) {
      resultsById.delete(toolCallId);
    }
    return {
      key: toolCallId || `tool-step-call-${index}`,
      name: toolCall.name,
      ...(toolCallId ? { toolCallId } : {}),
      call: toolCall,
      ...(matchedResult ? { result: matchedResult } : {})
    };
  });

  for (const [toolCallId, result] of resultsById.entries()) {
    steps.push({
      key: toolCallId || result.id,
      name: result.name,
      ...(toolCallId ? { toolCallId } : {}),
      result
    });
  }

  for (const result of unpairedResults) {
    steps.push({
      key: result.id,
      name: result.name,
      result
    });
  }

  return steps;
}

function mergeText(existing: string | undefined, incoming: string | undefined): string {
  const left = existing?.trim() ?? "";
  const right = incoming?.trim() ?? "";
  if (!left) {
    return right;
  }
  if (!right) {
    return left;
  }
  if (left === right) {
    return left;
  }
  if (left.includes(right)) {
    return left;
  }
  if (right.includes(left)) {
    return right;
  }
  return `${left}\n\n${right}`;
}

function pickLatestTimestamp(existing?: string, incoming?: string): string | undefined {
  if (!incoming) {
    return existing;
  }
  if (!existing) {
    return incoming;
  }
  const existingMs = Date.parse(existing);
  const incomingMs = Date.parse(incoming);
  if (!Number.isFinite(existingMs) || !Number.isFinite(incomingMs)) {
    return incoming;
  }
  return incomingMs >= existingMs ? incoming : existing;
}

function mergeToolCalls(existing: ChatToolCallView[], incoming: ChatToolCallView[] | undefined): ChatToolCallView[] {
  if (!incoming?.length) {
    return existing;
  }
  const merged = [...existing];
  const seen = new Set(merged.map((item) => `${item.id}|${item.name}|${item.arguments}`));
  for (const item of incoming) {
    const key = `${item.id}|${item.name}|${item.arguments}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    merged.push(item);
  }
  return merged;
}

function mergeToolResults(existing: ChatToolResultView[], incoming: ChatToolResultView): ChatToolResultView[] {
  const key = `${incoming.toolCallId ?? ""}|${incoming.name}|${incoming.output}`;
  if (existing.some((item) => `${item.toolCallId ?? ""}|${item.name}|${item.output}` === key)) {
    return existing;
  }
  return [...existing, incoming];
}

function createAssistantGroup(seed: ChatMessageView | undefined, index: number): ChatDisplayMessage {
  const seedId = seed?.id?.trim();
  return {
    key: seedId ? `assistant-${seedId}` : `assistant-${index}`,
    role: "assistant",
    content: seed?.role === "assistant" ? seed.content?.trim() ?? "" : "",
    timestamp: seed?.timestamp,
    attachments: [],
    reasoning: seed?.role === "assistant" ? seed.reasoning?.trim() : undefined,
    replyStatus: seed?.replyStatus,
    toolCalls: seed?.role === "assistant" ? [...(seed.toolCalls ?? [])] : [],
    toolResults: [],
    toolSteps: [],
    sourceMessageIds: seedId ? [seedId] : []
  };
}

function appendSourceMessageId(group: ChatDisplayMessage, message: ChatMessageView): ChatDisplayMessage {
  const sourceId = message.id?.trim();
  if (!sourceId || group.sourceMessageIds.includes(sourceId)) {
    return group;
  }
  return {
    ...group,
    sourceMessageIds: [...group.sourceMessageIds, sourceId]
  };
}

export function buildChatDisplayMessages(messages: ChatMessageView[]): ChatDisplayMessage[] {
  const output: ChatDisplayMessage[] = [];
  let activeAssistant: ChatDisplayMessage | null = null;

  const flushAssistant = () => {
    if (!activeAssistant) {
      return;
    }
    const hasVisibleContent = Boolean(activeAssistant.content.trim())
      || Boolean(activeAssistant.reasoning?.trim())
      || activeAssistant.toolCalls.length > 0
      || activeAssistant.toolResults.length > 0;
    if (hasVisibleContent) {
      output.push({
        ...activeAssistant,
        toolSteps: buildToolSteps(activeAssistant.toolCalls, activeAssistant.toolResults)
      });
    }
    activeAssistant = null;
  };

  const ensureAssistant = (seed: ChatMessageView | undefined, index: number): ChatDisplayMessage => {
    if (!activeAssistant) {
      activeAssistant = createAssistantGroup(seed, index);
      return activeAssistant;
    }
    if (seed?.timestamp) {
      activeAssistant = {
        ...activeAssistant,
        timestamp: pickLatestTimestamp(activeAssistant.timestamp, seed.timestamp),
        replyStatus: mergeReplyStatus(activeAssistant.replyStatus, seed.replyStatus)
      };
    }
    return activeAssistant;
  };

  messages.forEach((message, index) => {
    if (message.role === "user" || message.role === "system") {
      flushAssistant();
      output.push({
        key: message.id?.trim() || `${message.role}-${index}`,
        role: message.role,
        content: message.content,
        timestamp: message.timestamp,
        attachments: message.attachments ?? [],
        toolCalls: [],
        toolResults: [],
        toolSteps: [],
        sourceMessageIds: message.id?.trim() ? [message.id.trim()] : []
      });
      return;
    }

    if (message.role === "assistant") {
      let nextGroup = ensureAssistant(message, index);
      nextGroup = appendSourceMessageId(nextGroup, message);
      activeAssistant = {
        ...nextGroup,
        content: mergeText(nextGroup.content, message.content),
        reasoning: mergeText(nextGroup.reasoning, message.reasoning),
        toolCalls: mergeToolCalls(nextGroup.toolCalls, message.toolCalls),
        timestamp: pickLatestTimestamp(nextGroup.timestamp, message.timestamp),
        replyStatus: mergeReplyStatus(nextGroup.replyStatus, message.replyStatus)
      };
      return;
    }

    if (message.role === "tool") {
      let nextGroup = ensureAssistant(message, index);
      nextGroup = appendSourceMessageId(nextGroup, message);
      activeAssistant = {
        ...nextGroup,
        toolResults: mergeToolResults(nextGroup.toolResults, {
          id: message.id?.trim() || `tool-${index}`,
          name: message.toolName?.trim() || "工具结果",
          output: message.content,
          ...(message.toolCallId ? { toolCallId: message.toolCallId } : {}),
          ...(message.timestamp ? { timestamp: message.timestamp } : {})
        }),
        timestamp: pickLatestTimestamp(nextGroup.timestamp, message.timestamp),
        replyStatus: mergeReplyStatus(nextGroup.replyStatus, message.replyStatus)
      };
      return;
    }
  });

  flushAssistant();
  return output;
}