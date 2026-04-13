import { randomUUID } from "node:crypto";
import { EmployeeRepository } from "../repositories/employee-repository";
import { EmployeeSkillRepository } from "../repositories/employee-skill-repository";
import { SkillInstallationRepository } from "../repositories/skill-installation-repository";
import { RunRecordRepository, type RunRecordView } from "../repositories/run-record-repository";
import { ChatSessionRepository, type ChatSessionPage, type ChatSessionView } from "../repositories/chat-session-repository";
import { ChatMessageRepository, type ChatMessageView as PersistedChatMessageView } from "../repositories/chat-message-repository";
import { NextclawEngineGateway, type SessionHistoryMessage, type ToolCallView } from "../engine/NextclawEngineGateway";
import {
  buildChatResultCards,
  formatRunStatusMeta,
  type ChatMessageView,
  type ChatResultCardView
} from "../../shared/ui-models";
import { prepareEmployeeRuntime } from "./employee-runtime-preparation";
import { ConfigError, classifyError } from "../errors/platform-errors";
import { RunStatus } from "../db/enums";

export type EmployeeTurnResult = {
  runId: string;
  reply: string;
  sessionKey: string;
  messages: ChatMessageView[];
  resultCards: ChatResultCardView[];
  runSummary: string;
};

export type EmployeeChatStreamEvent =
  | { event: "run_started"; data: { runId: string; sessionKey: string } }
  | { event: "thinking"; data: { runId: string; content?: string } }
  | { event: "tool_call"; data: { runId: string; toolCallId?: string; name: string; args: string } }
  | { event: "tool_result"; data: { runId: string; toolCallId?: string; name: string; output: string } }
  | { event: "reply_delta"; data: { runId: string; delta: string } }
  | { event: "reply_final"; data: { runId: string; content: string } }
  | { event: "run_failed"; data: { runId: string; message: string } }
  | { event: "run_aborted"; data: { runId: string; reason: string } }
  | { event: "done"; data: { runId: string; sessionKey: string; status: string } };

type ActiveChatRun = {
  employeeId: string;
  sessionKey: string;
  abortController: AbortController;
};

type ChatSessionResolveOptions = {
  createIfMissing?: boolean;
  title?: string;
};

type StoredRunMetadata = {
  runId: string;
  runStatus: string;
};

function isAbortError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === "AbortError") {
    return true;
  }
  if (error instanceof Error) {
    if (error.name === "AbortError") {
      return true;
    }
    const message = error.message.toLowerCase();
    return message.includes("aborted") || message.includes("abort");
  }
  return false;
}

function buildEmployeeChatSessionKey(employeeId: string): string {
  return `employee:${employeeId}:chat:${randomUUID()}`;
}

function decodeSessionKeyIfNeeded(sessionKey: string): string {
  if (!sessionKey.includes("%")) {
    return sessionKey;
  }
  try {
    return decodeURIComponent(sessionKey);
  } catch {
    return sessionKey;
  }
}

function toUiMessage(message: PersistedChatMessageView, inferredRunStatus?: string): ChatMessageView {
  const resolvedRunStatus = typeof message.metadata?.runStatus === "string"
    ? message.metadata.runStatus
    : inferredRunStatus;
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    timestamp: message.createdAt,
    ...(message.metadata && Array.isArray(message.metadata.toolCalls)
      ? {
          toolCalls: message.metadata.toolCalls
            .filter((item): item is { id: string; name: string; arguments: string } => Boolean(item) && typeof item === "object")
            .map((item) => ({
              id: item.id,
              name: item.name,
              arguments: item.arguments
            }))
        }
      : {}),
    ...(typeof message.metadata?.reasoning === "string" ? { reasoning: message.metadata.reasoning } : {}),
    ...(resolvedRunStatus && message.role !== "user" ? { replyStatus: formatRunStatusMeta(resolvedRunStatus) } : {}),
    ...(message.toolCallId ? { toolCallId: message.toolCallId } : {}),
    ...(message.toolName ? { toolName: message.toolName } : {})
  };
}

function toStoredMessage(sessionId: string, message: SessionHistoryMessage, runMetadata?: StoredRunMetadata): {
  sessionId: string;
  role: PersistedChatMessageView["role"];
  content: string;
  createdAt?: string;
  toolName?: string;
  toolCallId?: string;
  metadata?: Record<string, unknown>;
} {
  const metadata: Record<string, unknown> = {};
  if (message.toolCalls?.length) {
    metadata.toolCalls = message.toolCalls;
  }
  if (message.reasoning?.trim()) {
    metadata.reasoning = message.reasoning;
  }
  if (runMetadata) {
    metadata.runId = runMetadata.runId;
    metadata.runStatus = runMetadata.runStatus;
  }
  return {
    sessionId,
    role: message.role,
    content: message.content,
    ...(message.timestamp ? { createdAt: message.timestamp } : {}),
    ...(message.toolName ? { toolName: message.toolName } : {}),
    ...(message.toolCallId ? { toolCallId: message.toolCallId } : {}),
    ...(Object.keys(metadata).length > 0 ? { metadata } : {})
  };
}

function pickLatestPreview(messages: SessionHistoryMessage[], fallback: string): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.content?.trim()) {
      return message.content;
    }
  }
  return fallback;
}

function buildAutomatedSessionTitle(title?: string): string {
  const trimmed = title?.trim();
  return trimmed || "定时任务";
}

function mergeStreamingText(existing: string | undefined, incoming: string | undefined): string | undefined {
  const nextText = incoming?.trim();
  if (!nextText) {
    return existing;
  }
  const currentText = existing?.trim();
  if (!currentText) {
    return incoming;
  }
  if (nextText === currentText) {
    return existing;
  }
  if (nextText.startsWith(currentText)) {
    return incoming;
  }
  if (currentText.endsWith(nextText)) {
    return existing;
  }
  return `${existing}\n${incoming}`;
}

function mergeToolCallViews(existing: ToolCallView[], incoming: ToolCallView[]): ToolCallView[] {
  if (incoming.length === 0) {
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

function mergeToolResultMessages(existing: SessionHistoryMessage[], incoming: SessionHistoryMessage): SessionHistoryMessage[] {
  const key = `${incoming.toolCallId ?? ""}|${incoming.toolName ?? ""}|${incoming.content}`;
  if (existing.some((item) => `${item.toolCallId ?? ""}|${item.toolName ?? ""}|${item.content}` === key)) {
    return existing;
  }
  return [...existing, incoming];
}

function buildAbortedStreamMessages(params: {
  partialReply: string;
  reasoning?: string;
  toolCalls: ToolCallView[];
  toolResults: SessionHistoryMessage[];
}): SessionHistoryMessage[] {
  const messages: SessionHistoryMessage[] = [];
  const hasAssistantState = Boolean(params.partialReply.trim())
    || Boolean(params.reasoning?.trim())
    || params.toolCalls.length > 0;

  if (hasAssistantState) {
    messages.push({
      role: "assistant",
      content: params.partialReply,
      ...(params.reasoning?.trim() ? { reasoning: params.reasoning } : {}),
      ...(params.toolCalls.length > 0 ? { toolCalls: params.toolCalls } : {})
    });
  }

  return [...messages, ...params.toolResults];
}

function buildRunIntervals(runs: RunRecordView[]): Array<{ status: string; startedAtMs: number; nextStartedAtMs: number | null }> {
  const sortedRuns = [...runs].sort((left, right) => Date.parse(left.startedAt) - Date.parse(right.startedAt));
  return sortedRuns.map((run, index) => {
    const nextRun = sortedRuns[index + 1];
    return {
      status: run.status,
      startedAtMs: Date.parse(run.startedAt),
      nextStartedAtMs: nextRun ? Date.parse(nextRun.startedAt) : null
    };
  });
}

function inferRunStatusForMessage(
  message: PersistedChatMessageView,
  runIntervals: Array<{ status: string; startedAtMs: number; nextStartedAtMs: number | null }>
): string | undefined {
  if (message.role !== "assistant" && message.role !== "tool") {
    return undefined;
  }
  const createdAtMs = Date.parse(message.createdAt);
  if (!Number.isFinite(createdAtMs)) {
    return undefined;
  }
  for (let index = runIntervals.length - 1; index >= 0; index -= 1) {
    const interval = runIntervals[index];
    if (!interval) {
      continue;
    }
    if (createdAtMs < interval.startedAtMs) {
      continue;
    }
    if (interval.nextStartedAtMs !== null && createdAtMs >= interval.nextStartedAtMs) {
      continue;
    }
    return interval.status;
  }
  return undefined;
}

export class EmployeeRunService {
  private readonly activeChatRuns = new Map<string, ActiveChatRun>();

  constructor(
    private readonly employeeRepo: EmployeeRepository,
    private readonly employeeSkillRepo: EmployeeSkillRepository,
    private readonly runRepo: RunRecordRepository,
    private readonly gateway: NextclawEngineGateway,
    private readonly skillInstallationRepo?: SkillInstallationRepository,
    private readonly chatSessionRepo?: ChatSessionRepository,
    private readonly chatMessageRepo?: ChatMessageRepository
  ) {}

  private requireChatPersistence(): {
    sessionRepo: ChatSessionRepository;
    messageRepo: ChatMessageRepository;
  } {
    if (!this.chatSessionRepo || !this.chatMessageRepo) {
      throw new Error("chat persistence repositories are not configured");
    }
    return {
      sessionRepo: this.chatSessionRepo,
      messageRepo: this.chatMessageRepo
    };
  }

  private async getEmployeeOrThrow(employeeId: string) {
    const employee = await this.employeeRepo.getById(employeeId);
    if (!employee) {
      throw new Error(`Employee not found: ${employeeId}`);
    }
    return employee;
  }

  private ensureProviderConfigured(): void {
    if (typeof this.gateway.hasConfiguredProvider === "function" && !this.gateway.hasConfiguredProvider()) {
      throw new ConfigError(
        "未配置模型 API Key",
        "请在「系统设置 → 模型提供商」中配置 API Key 后再执行。"
      );
    }
  }

  private async prepareRuntime(employeeId: string) {
    const employee = await this.getEmployeeOrThrow(employeeId);
    this.ensureProviderConfigured();
    const prepared = await prepareEmployeeRuntime({
      employee,
      employeeSkillRepo: this.employeeSkillRepo,
      skillInstallationRepo: this.skillInstallationRepo,
      homeDir: this.gateway.homeDir,
      workspaceDir: this.gateway.workspaceDir
    });
    return {
      employee,
      workspace: prepared.workspace,
      skillNames: prepared.skillNames
    };
  }

  private async resolveChatSession(
    employeeId: string,
    sessionKey?: string,
    options?: ChatSessionResolveOptions
  ): Promise<ChatSessionView> {
    const { sessionRepo } = this.requireChatPersistence();
    if (sessionKey?.trim()) {
      const normalizedSessionKey = sessionKey.trim();
      const existing = await sessionRepo.getByEmployeeIdAndSessionKey(employeeId, normalizedSessionKey);
      if (existing) {
        return existing;
      }
      const decodedSessionKey = decodeSessionKeyIfNeeded(normalizedSessionKey);
      if (decodedSessionKey !== normalizedSessionKey) {
        const decodedMatch = await sessionRepo.getByEmployeeIdAndSessionKey(employeeId, decodedSessionKey);
        if (decodedMatch) {
          return decodedMatch;
        }
      }
      if (options?.createIfMissing) {
        return sessionRepo.create({
          employeeId,
          sessionKey: decodedSessionKey,
          title: buildAutomatedSessionTitle(options.title)
        });
      }
      throw new Error(`Chat session not found: ${sessionKey}`);
    }
    return sessionRepo.create({
      employeeId,
      sessionKey: buildEmployeeChatSessionKey(employeeId),
      title: options?.title ? buildAutomatedSessionTitle(options.title) : "新对话"
    });
  }

  private async persistChatMessages(
    sessionId: string,
    messages: SessionHistoryMessage[],
    runMetadata?: StoredRunMetadata
  ): Promise<PersistedChatMessageView[]> {
    const { messageRepo } = this.requireChatPersistence();
    const storableMessages = messages
      .filter((message) => message.role !== "user")
      .map((message) => toStoredMessage(sessionId, message, runMetadata));
    return messageRepo.createMany(storableMessages);
  }

  async listChatSessions(params: {
    employeeId: string;
    limit?: number;
    before?: string | null;
  }): Promise<ChatSessionPage> {
    await this.getEmployeeOrThrow(params.employeeId);
    const { sessionRepo } = this.requireChatPersistence();
    return sessionRepo.listByEmployeeId(params);
  }

  async createChatSession(employeeId: string): Promise<ChatSessionView> {
    await this.getEmployeeOrThrow(employeeId);
    const { sessionRepo } = this.requireChatPersistence();
    return sessionRepo.create({
      employeeId,
      sessionKey: buildEmployeeChatSessionKey(employeeId),
      title: "新对话"
    });
  }

  async getChatMessages(params: {
    employeeId: string;
    sessionKey: string;
    limit?: number;
    before?: string | null;
  }): Promise<{ session: ChatSessionView; items: ChatMessageView[]; nextCursor: string | null }> {
    const session = await this.resolveChatSession(params.employeeId, params.sessionKey);
    const { messageRepo } = this.requireChatPersistence();
    const [page, runs] = await Promise.all([
      messageRepo.listBySessionId({
        sessionId: session.id,
        limit: params.limit,
        before: params.before
      }),
      this.runRepo.listByEmployeeIdAndSessionKey({
        employeeId: params.employeeId,
        sessionKey: session.sessionKey
      })
    ]);
    const runIntervals = buildRunIntervals(runs);
    return {
      session,
      items: page.items.map((message) => toUiMessage(message, inferRunStatusForMessage(message, runIntervals))),
      nextCursor: page.nextCursor
    };
  }

  async cancelChatRun(params: { employeeId: string; runId: string }): Promise<{ stopped: boolean; sessionKey?: string; reason?: string }> {
    const activeRun = this.activeChatRuns.get(params.runId);
    if (!activeRun) {
      return { stopped: false, reason: "run not found or already completed" };
    }
    if (activeRun.employeeId !== params.employeeId) {
      return { stopped: false, reason: "run does not belong to the employee" };
    }
    activeRun.abortController.abort(new Error("chat turn stopped by user"));
    return {
      stopped: true,
      sessionKey: activeRun.sessionKey
    };
  }

  // eslint-disable-next-line max-lines-per-function
  async streamChatTurn(params: {
    employeeId: string;
    message: string;
    sessionKey?: string;
    signal?: AbortSignal;
    onEvent: (event: EmployeeChatStreamEvent) => void | Promise<void>;
  }): Promise<{ runId: string; sessionKey: string; reply: string }> {
    const { sessionRepo, messageRepo } = this.requireChatPersistence();
    const { employee, workspace, skillNames } = await this.prepareRuntime(params.employeeId);
    const session = await this.resolveChatSession(employee.id, params.sessionKey);
    const run = await this.runRepo.create({
      employeeId: employee.id,
      triggerType: "manual",
      triggerSource: "chat",
      sessionKey: session.sessionKey
    });
    const userMessageCreatedAt = new Date().toISOString();
    await messageRepo.createMany([{
      sessionId: session.id,
      role: "user",
      content: params.message,
      createdAt: userMessageCreatedAt,
      metadata: {
        runId: run.id,
        runStatus: RunStatus.Running
      }
    }]);
    await sessionRepo.touchWithMessage({
      sessionId: session.id,
      messageCountIncrement: 1,
      latestContent: params.message,
      titleSeed: params.message
    });
    const abortController = new AbortController();
    if (params.signal) {
      if (params.signal.aborted) {
        abortController.abort(params.signal?.reason);
      } else {
        params.signal.addEventListener("abort", () => {
          abortController.abort(params.signal?.reason);
        }, { once: true });
      }
    }
    this.activeChatRuns.set(run.id, {
      employeeId: employee.id,
      sessionKey: session.sessionKey,
      abortController
    });

    const deltaParts: string[] = [];
    let streamedReasoning: string | undefined;
    let streamedToolCalls: ToolCallView[] = [];
    let streamedToolResults: SessionHistoryMessage[] = [];
    let thinkingSent = false;
    const emit = async (event: EmployeeChatStreamEvent): Promise<void> => {
      await params.onEvent(event);
    };

    const emitThinking = async (content?: string): Promise<void> => {
      if (!content?.trim() && thinkingSent) {
        return;
      }
      thinkingSent = true;
      await emit({
        event: "thinking",
        data: {
          runId: run.id,
          ...(content?.trim() ? { content } : {})
        }
      });
    };

    await emit({
      event: "run_started",
      data: {
        runId: run.id,
        sessionKey: session.sessionKey
      }
    });
    await emitThinking();

    try {
      const result = await this.gateway.runEmployeeTurn({
        employeeId: employee.id,
        agentId: employee.code,
        sessionKey: session.sessionKey,
        workspace,
        message: params.message,
        model: employee.model || undefined,
        requestedSkills: skillNames.length > 0 ? skillNames : undefined,
        onAssistantDelta: (delta) => {
          if (!delta) {
            return;
          }
          deltaParts.push(delta);
          void emit({
            event: "reply_delta",
            data: {
              runId: run.id,
              delta
            }
          });
        },
        onSessionEvent: (event) => {
          const message = (event.data?.message ?? null) as Record<string, unknown> | null;
          if (!message || typeof message.role !== "string") {
            return;
          }
          if (typeof message.reasoning_content === "string" && message.reasoning_content.trim()) {
            streamedReasoning = mergeStreamingText(streamedReasoning, message.reasoning_content);
            void emitThinking(message.reasoning_content);
          }
          if (message.role === "assistant" && Array.isArray(message.tool_calls)) {
            const nextToolCalls: ToolCallView[] = [];
            for (const toolCall of message.tool_calls) {
              if (!toolCall || typeof toolCall !== "object") {
                continue;
              }
              const toolCallRecord = toolCall as Record<string, unknown>;
              const nextToolCall: ToolCallView = {
                id: typeof toolCallRecord.id === "string" ? toolCallRecord.id : "",
                name: String((toolCallRecord.function as Record<string, unknown>)?.name ?? toolCallRecord.name ?? ""),
                arguments: typeof (toolCallRecord.function as Record<string, unknown>)?.arguments === "string"
                  ? String((toolCallRecord.function as Record<string, unknown>).arguments)
                  : JSON.stringify(toolCallRecord.arguments ?? {})
              };
              nextToolCalls.push(nextToolCall);
              void emit({
                event: "tool_call",
                data: {
                  runId: run.id,
                  toolCallId: nextToolCall.id || undefined,
                  name: nextToolCall.name,
                  args: nextToolCall.arguments
                }
              });
            }
            streamedToolCalls = mergeToolCallViews(streamedToolCalls, nextToolCalls);
          }
          if (message.role === "tool") {
            streamedToolResults = mergeToolResultMessages(streamedToolResults, {
              role: "tool",
              content: typeof message.content === "string" ? message.content : "",
              ...(typeof message.tool_call_id === "string" ? { toolCallId: message.tool_call_id } : {}),
              ...(typeof message.name === "string" ? { toolName: message.name } : {})
            });
            void emit({
              event: "tool_result",
              data: {
                runId: run.id,
                toolCallId: typeof message.tool_call_id === "string" ? message.tool_call_id : undefined,
                name: typeof message.name === "string" ? message.name : "工具结果",
                output: typeof message.content === "string" ? message.content : ""
              }
            });
          }
        },
        abortSignal: abortController.signal
      });

      const persistedMessages = await this.persistChatMessages(session.id, result.newMessages, {
        runId: run.id,
        runStatus: RunStatus.Completed
      });
      if (persistedMessages.length > 0) {
        await sessionRepo.touchWithMessage({
          sessionId: session.id,
          messageCountIncrement: persistedMessages.length,
          latestContent: pickLatestPreview(result.newMessages, result.reply),
          titleSeed: params.message
        });
      }

      const resultCards = buildChatResultCards(result.reply);
      await this.runRepo.appendEvents(
        run.id,
        result.events.map((event) => ({
          eventType: event.type,
          payload: event.data
        }))
      );
      const messagePage = await messageRepo.listBySessionId({
        sessionId: session.id,
        limit: 100
      });
      await this.runRepo.complete(run.id, {
        status: RunStatus.Completed,
        summary: result.reply,
        result: {
          reply: result.reply,
          sessionKey: result.sessionKey,
          messages: messagePage.items.map((message) => toUiMessage(message)),
          resultCards,
          runSummary: result.reply
        }
      });
      await emit({
        event: "reply_final",
        data: {
          runId: run.id,
          content: result.reply
        }
      });
      await emit({
        event: "done",
        data: {
          runId: run.id,
          sessionKey: session.sessionKey,
          status: RunStatus.Completed
        }
      });
      return {
        runId: run.id,
        sessionKey: session.sessionKey,
        reply: result.reply
      };
    } catch (error) {
      if (isAbortError(error) || abortController.signal.aborted) {
        const partialReply = deltaParts.join("");
        const abortedMessages = buildAbortedStreamMessages({
          partialReply,
          reasoning: streamedReasoning,
          toolCalls: streamedToolCalls,
          toolResults: streamedToolResults
        });
        const persistedMessages = await this.persistChatMessages(session.id, abortedMessages, {
          runId: run.id,
          runStatus: RunStatus.Aborted
        });
        if (persistedMessages.length > 0) {
          await sessionRepo.touchWithMessage({
            sessionId: session.id,
            messageCountIncrement: persistedMessages.length,
            latestContent: pickLatestPreview(abortedMessages, partialReply || params.message),
            titleSeed: params.message
          });
        }
        await this.runRepo.complete(run.id, {
          status: RunStatus.Aborted,
          summary: partialReply || "chat turn stopped by user",
          result: {
            reply: partialReply,
            sessionKey: session.sessionKey,
            aborted: true
          }
        });
        await emit({
          event: "run_aborted",
          data: {
            runId: run.id,
            reason: "chat turn stopped by user"
          }
        });
        await emit({
          event: "done",
          data: {
            runId: run.id,
            sessionKey: session.sessionKey,
            status: RunStatus.Aborted
          }
        });
        return {
          runId: run.id,
          sessionKey: session.sessionKey,
          reply: partialReply
        };
      }

      const classified = classifyError(error);
      await this.runRepo.complete(run.id, {
        status: RunStatus.Failed,
        summary: classified.message,
        result: {
          error: classified.toJSON(),
          sessionKey: session.sessionKey
        }
      });
      await emit({
        event: "run_failed",
        data: {
          runId: run.id,
          message: classified.message
        }
      });
      await emit({
        event: "done",
        data: {
          runId: run.id,
          sessionKey: session.sessionKey,
          status: RunStatus.Failed
        }
      });
      return {
        runId: run.id,
        sessionKey: session.sessionKey,
        reply: ""
      };
    } finally {
      this.activeChatRuns.delete(run.id);
    }
  }

  async runEmployeeTurn(params: {
    employeeId: string;
    message: string;
    triggerType: string;
    triggerSource: string;
    sessionKey?: string;
    sessionTitle?: string;
  }): Promise<EmployeeTurnResult> {
    const { employee, workspace, skillNames } = await this.prepareRuntime(params.employeeId);
    const persistence = this.chatSessionRepo && this.chatMessageRepo
      ? this.requireChatPersistence()
      : null;
    const automatedChatSession = persistence && params.triggerType === "scheduled"
      ? await this.resolveChatSession(employee.id, params.sessionKey, {
          createIfMissing: true,
          title: params.sessionTitle
        })
      : null;

    const run = await this.runRepo.create({
      employeeId: employee.id,
      triggerType: params.triggerType,
      triggerSource: params.triggerSource,
      sessionKey: automatedChatSession?.sessionKey ?? params.sessionKey ?? null
    });

    if (automatedChatSession && persistence) {
      await persistence.messageRepo.createMany([{
        sessionId: automatedChatSession.id,
        role: "user",
        content: params.message,
        metadata: {
          automated: true,
          runId: run.id,
          runStatus: RunStatus.Running,
          triggerType: params.triggerType,
          triggerSource: params.triggerSource
        }
      }]);
      await persistence.sessionRepo.touchWithMessage({
        sessionId: automatedChatSession.id,
        messageCountIncrement: 1,
        latestContent: params.message,
        titleSeed: params.sessionTitle ?? params.message
      });
    }

    try {
      const result = await this.gateway.runEmployeeTurn({
        employeeId: employee.id,
        agentId: employee.code,
        workspace,
        message: params.message,
        model: employee.model || undefined,
        requestedSkills: skillNames.length > 0 ? skillNames : undefined,
        disableCronTool: params.triggerType === "scheduled"
      });
      if (automatedChatSession && persistence) {
        const persistedMessages = await this.persistChatMessages(automatedChatSession.id, result.newMessages, {
          runId: run.id,
          runStatus: RunStatus.Completed
        });
        if (persistedMessages.length > 0) {
          await persistence.sessionRepo.touchWithMessage({
            sessionId: automatedChatSession.id,
            messageCountIncrement: persistedMessages.length,
            latestContent: pickLatestPreview(result.newMessages, result.reply),
            titleSeed: params.sessionTitle ?? params.message
          });
        }
      }
      const resultCards = buildChatResultCards(result.reply);
      const messages = automatedChatSession && persistence
        ? (await persistence.messageRepo.listBySessionId({
            sessionId: automatedChatSession.id,
            limit: 100
          })).items.map((message) => toUiMessage(message))
        : this.gateway.getSessionHistory(result.sessionKey);
      await this.runRepo.appendEvents(
        run.id,
        result.events.map((event) => ({
          eventType: event.type,
          payload: event.data
        }))
      );
      await this.runRepo.complete(run.id, {
        status: RunStatus.Completed,
        summary: result.reply,
        result: {
          reply: result.reply,
          sessionKey: automatedChatSession?.sessionKey ?? result.sessionKey,
          messages,
          resultCards,
          runSummary: result.reply
        }
      });
      return {
        runId: run.id,
        reply: result.reply,
        sessionKey: automatedChatSession?.sessionKey ?? result.sessionKey,
        messages,
        resultCards,
        runSummary: result.reply
      };
    } catch (error) {
      const classified = classifyError(error);
      await this.runRepo.complete(run.id, {
        status: RunStatus.Failed,
        summary: String(error),
        result: {
          error: classified.toJSON()
        }
      });
      throw classified;
    }
  }
}
