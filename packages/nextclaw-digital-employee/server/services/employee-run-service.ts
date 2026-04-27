import { randomUUID } from "node:crypto";
import { EmployeeRepository } from "../repositories/employee-repository";
import { EmployeeSkillRepository } from "../repositories/employee-skill-repository";
import { SkillInstallationRepository } from "../repositories/skill-installation-repository";
import { RunRecordRepository, type RunRecordView } from "../repositories/run-record-repository";
import {
  ChatSessionRepository,
  type ChatSessionAccessScope,
  type ChatSessionPage,
  type ChatSessionView
} from "../repositories/chat-session-repository";
import { ChatMessageRepository, type ChatMessageView as PersistedChatMessageView } from "../repositories/chat-message-repository";
import { NextclawEngineGateway, type SessionHistoryMessage, type ToolCallView } from "../engine/NextclawEngineGateway";
import {
  buildChatFailureMessage,
  buildChatResultCards,
  formatRunStatusMeta,
  type ChatMessageView,
  type ChatProcessTimelineEntry,
  type ChatResultCardView
} from "../../shared/ui-models";
import {
  normalizeChatMessageContent,
  normalizeChatMessageTimestamp,
} from "../chat/chat-message-normalization";
import type { ChatAttachmentView } from "../../shared/ui-models";
import { prepareEmployeeRuntime } from "./employee-runtime-preparation";
import { ConfigError, classifyError } from "../errors/platform-errors";
import { RunStatus } from "../db/enums";
import { buildAttachmentPromptText, normalizeChatAttachment } from "../chat/chat-attachments";
import { EmployeeUploadFileService } from "./employee-upload-file-service";
import { IdentityResolver } from "./identity-resolver";
import { isConversationResetCommand } from "../../shared/chat-command";
import { UserRepository } from "../repositories/user-repository";

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
  actorUserId?: string;
  accessScope?: ChatSessionAccessScope;
};

type StoredRunMetadata = {
  runId: string;
  runStatus: string;
};

function normalizeChatAttachments(rawItems: unknown[] | undefined): ChatAttachmentView[] {
  if (!rawItems?.length) {
    return [];
  }
  return rawItems
    .map((item) => normalizeChatAttachment(item))
    .filter((item): item is ChatAttachmentView => Boolean(item));
}

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
  const attachments = normalizeChatAttachments(Array.isArray(message.metadata?.attachments) ? message.metadata.attachments : undefined);
  const processTimeline = normalizeStoredProcessTimeline(
    Array.isArray(message.metadata?.processTimeline) ? message.metadata.processTimeline : undefined
  );
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    timestamp: message.createdAt,
    ...(attachments.length > 0 ? { attachments } : {}),
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
    ...(processTimeline.length > 0 ? { processTimeline } : {}),
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
  if (message.processTimeline?.length) {
    metadata.processTimeline = message.processTimeline;
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

function normalizeStoredProcessTimeline(rawItems: unknown[] | undefined): ChatProcessTimelineEntry[] {
  if (!rawItems?.length) {
    return [];
  }
  const output: ChatProcessTimelineEntry[] = [];
  for (const rawItem of rawItems) {
    if (!rawItem || typeof rawItem !== "object") {
      continue;
    }
    const item = rawItem as Record<string, unknown>;
    const id = typeof item.id === "string" ? item.id.trim() : "";
    const kind = typeof item.kind === "string" ? item.kind.trim() : "";
    const timestamp = typeof item.timestamp === "string" && item.timestamp.trim() ? item.timestamp.trim() : undefined;
    if (!id || !kind) {
      continue;
    }
    if ((kind === "reasoning" || kind === "reply") && typeof item.content === "string" && item.content.trim()) {
      output.push({
        id,
        kind,
        ...(timestamp ? { timestamp } : {}),
        content: item.content
      } as ChatProcessTimelineEntry);
      continue;
    }
    if ((kind === "tool_call" || kind === "tool_result") && typeof item.name === "string" && item.name.trim()) {
      if (kind === "tool_call" && typeof item.arguments === "string") {
        output.push({
          id,
          kind,
          ...(timestamp ? { timestamp } : {}),
          name: item.name,
          ...(typeof item.toolCallId === "string" && item.toolCallId.trim() ? { toolCallId: item.toolCallId.trim() } : {}),
          arguments: item.arguments
        } as ChatProcessTimelineEntry);
        continue;
      }
      if (kind === "tool_result" && typeof item.output === "string") {
        output.push({
          id,
          kind,
          ...(timestamp ? { timestamp } : {}),
          name: item.name,
          ...(typeof item.toolCallId === "string" && item.toolCallId.trim() ? { toolCallId: item.toolCallId.trim() } : {}),
          output: item.output
        } as ChatProcessTimelineEntry);
      }
    }
  }
  return output;
}

function buildTimelineTimestamp(): string {
  return new Date().toISOString();
}

function appendReasoningTimelineEntry(
  timeline: ChatProcessTimelineEntry[],
  content: string | undefined,
  timestamp = buildTimelineTimestamp()
): ChatProcessTimelineEntry[] {
  const trimmedContent = content?.trim();
  if (!trimmedContent) {
    return timeline;
  }
  return [...timeline, {
    id: randomUUID(),
    kind: "reasoning",
    timestamp,
    content: trimmedContent
  }];
}

function upsertToolCallTimelineEntry(
  timeline: ChatProcessTimelineEntry[],
  toolCall: ToolCallView,
  timestamp = buildTimelineTimestamp()
): ChatProcessTimelineEntry[] {
  const id = toolCall.id.trim() || randomUUID();
  const nextEntry: ChatProcessTimelineEntry = {
    id,
    kind: "tool_call",
    timestamp,
    name: toolCall.name,
    ...(toolCall.id.trim() ? { toolCallId: toolCall.id.trim() } : {}),
    arguments: toolCall.arguments
  };
  const existingIndex = timeline.findIndex((item) => item.kind === "tool_call" && item.id === id);
  if (existingIndex === -1) {
    return [...timeline, nextEntry];
  }
  const nextTimeline = [...timeline];
  nextTimeline[existingIndex] = nextEntry;
  return nextTimeline;
}

function upsertToolResultTimelineEntry(
  timeline: ChatProcessTimelineEntry[],
  params: { toolCallId?: string; name: string; output: string },
  timestamp = buildTimelineTimestamp()
): ChatProcessTimelineEntry[] {
  const id = params.toolCallId?.trim() ? `${params.toolCallId.trim()}-result` : randomUUID();
  const nextEntry: ChatProcessTimelineEntry = {
    id,
    kind: "tool_result",
    timestamp,
    name: params.name,
    ...(params.toolCallId?.trim() ? { toolCallId: params.toolCallId.trim() } : {}),
    output: params.output
  };
  const existingIndex = timeline.findIndex((item) => item.kind === "tool_result" && item.id === id);
  if (existingIndex === -1) {
    return [...timeline, nextEntry];
  }
  const nextTimeline = [...timeline];
  nextTimeline[existingIndex] = nextEntry;
  return nextTimeline;
}

function upsertReplyTimelineEntry(
  timeline: ChatProcessTimelineEntry[],
  content: string,
  timestamp = buildTimelineTimestamp()
): ChatProcessTimelineEntry[] {
  const trimmedContent = content.trim();
  if (!trimmedContent) {
    return timeline;
  }
  const nextEntry: ChatProcessTimelineEntry = {
    id: "reply-final",
    kind: "reply",
    timestamp,
    content: trimmedContent
  };
  const existingIndex = timeline.findIndex((item) => item.kind === "reply" && item.id === "reply-final");
  if (existingIndex === -1) {
    return [...timeline, nextEntry];
  }
  const nextTimeline = [...timeline];
  nextTimeline[existingIndex] = nextEntry;
  return nextTimeline;
}

function buildProcessTimelineFromSessionMessages(messages: SessionHistoryMessage[]): ChatProcessTimelineEntry[] {
  let timeline: ChatProcessTimelineEntry[] = [];
  for (const message of messages) {
    if (message.role === "assistant") {
      if (message.processTimeline?.length) {
        timeline = [...timeline, ...message.processTimeline];
        continue;
      }
      timeline = appendReasoningTimelineEntry(timeline, message.reasoning, message.timestamp);
      for (const toolCall of message.toolCalls ?? []) {
        timeline = upsertToolCallTimelineEntry(timeline, toolCall, message.timestamp);
      }
      timeline = upsertReplyTimelineEntry(timeline, message.content, message.timestamp);
      continue;
    }
    if (message.role === "tool") {
      timeline = upsertToolResultTimelineEntry(timeline, {
        toolCallId: message.toolCallId,
        name: message.toolName ?? "工具结果",
        output: message.content
      }, message.timestamp);
    }
  }
  return timeline;
}

function attachProcessTimelineToAssistantMessage(
  messages: SessionHistoryMessage[],
  processTimeline: ChatProcessTimelineEntry[]
): SessionHistoryMessage[] {
  if (processTimeline.length === 0) {
    return messages;
  }
  const assistantIndex = messages.findIndex((message) => message.role === "assistant");
  if (assistantIndex === -1) {
    return messages;
  }
  const nextMessages = [...messages];
  const target = nextMessages[assistantIndex];
  if (!target) {
    return messages;
  }
  nextMessages[assistantIndex] = {
    ...target,
    processTimeline
  };
  return nextMessages;
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

function buildFailedStreamMessages(params: {
  partialReply: string;
  reasoning?: string;
  toolCalls: ToolCallView[];
  toolResults: SessionHistoryMessage[];
  errorMessage: string;
}): SessionHistoryMessage[] {
  return [
    ...buildAbortedStreamMessages(params),
    {
      role: "assistant",
      content: buildChatFailureMessage(params.errorMessage)
    }
  ];
}

function buildFailedAutomationMessages(params: {
  errorMessage: string;
}): SessionHistoryMessage[] {
  return [{
    role: "assistant",
    content: buildChatFailureMessage(params.errorMessage)
  }];
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
    private readonly chatMessageRepo?: ChatMessageRepository,
    private readonly identityResolver?: IdentityResolver,
    private readonly userRepo?: UserRepository
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
      const accessScope = options?.accessScope ?? "all";
      const existing = await sessionRepo.getByEmployeeIdAndSessionKey(employeeId, normalizedSessionKey, {
        accessScope,
        actorUserId: options?.actorUserId
      });
      if (existing) {
        return existing;
      }
      const decodedSessionKey = decodeSessionKeyIfNeeded(normalizedSessionKey);
      if (decodedSessionKey !== normalizedSessionKey) {
        const decodedMatch = await sessionRepo.getByEmployeeIdAndSessionKey(employeeId, decodedSessionKey, {
          accessScope,
          actorUserId: options?.actorUserId
        });
        if (decodedMatch) {
          return decodedMatch;
        }
      }
      if (options?.createIfMissing) {
        return sessionRepo.create({
          employeeId,
          sessionKey: decodedSessionKey,
          title: buildAutomatedSessionTitle(options.title),
          createdByUserId: options.actorUserId,
        });
      }
      throw new Error(`Chat session not found: ${sessionKey}`);
    }
    return sessionRepo.create({
      employeeId,
      sessionKey: buildEmployeeChatSessionKey(employeeId),
      title: options?.title ? buildAutomatedSessionTitle(options.title) : "新对话",
      createdByUserId: options?.actorUserId,
    });
  }

  private async persistChatMessages(
    sessionId: string,
    messages: SessionHistoryMessage[],
    runMetadata?: StoredRunMetadata
  ): Promise<PersistedChatMessageView[]> {
    const { messageRepo } = this.requireChatPersistence();
    const messagesWithTimeline = messages.some((message) => message.processTimeline?.length)
      ? messages
      : attachProcessTimelineToAssistantMessage(messages, buildProcessTimelineFromSessionMessages(messages));
    const storableMessages = messagesWithTimeline
      .filter((message) => message.role !== "user")
      .map((message) => toStoredMessage(sessionId, message, runMetadata));
    return messageRepo.createMany(storableMessages);
  }

  async listChatSessions(params: {
    employeeId: string;
    limit?: number;
    before?: string | null;
    actorUserId?: string;
    accessScope?: ChatSessionAccessScope;
  }): Promise<ChatSessionPage> {
    await this.getEmployeeOrThrow(params.employeeId);
    const { sessionRepo } = this.requireChatPersistence();
    const page = await sessionRepo.listByEmployeeId(params);
    if (!this.userRepo || page.items.length === 0) {
      return page;
    }

    const creatorIds = [...new Set(page.items
      .map((item) => item.createdByUserId)
      .filter((value): value is string => Boolean(value)))];
    if (creatorIds.length === 0) {
      return page;
    }

    const displayNamesById = await this.userRepo.listDisplayNamesByIds(creatorIds);
    return {
      ...page,
      items: page.items.map((item) => ({
        ...item,
        createdByUserDisplayName: item.createdByUserId ? displayNamesById[item.createdByUserId] ?? null : null
      }))
    };
  }

  async createChatSession(employeeId: string, actorUserId?: string): Promise<ChatSessionView> {
    await this.getEmployeeOrThrow(employeeId);
    const { sessionRepo } = this.requireChatPersistence();
    return sessionRepo.create({
      employeeId,
      sessionKey: buildEmployeeChatSessionKey(employeeId),
      title: "新对话",
      createdByUserId: actorUserId,
    });
  }

  async getChatMessages(params: {
    employeeId: string;
    sessionKey: string;
    limit?: number;
    before?: string | null;
    actorUserId?: string;
    accessScope?: ChatSessionAccessScope;
  }): Promise<{ session: ChatSessionView; items: ChatMessageView[]; nextCursor: string | null }> {
    const session = await this.resolveChatSession(params.employeeId, params.sessionKey, {
      actorUserId: params.actorUserId,
      accessScope: params.accessScope
    });
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
    attachments?: ChatAttachmentView[];
    sessionKey?: string;
    actorUserId?: string;
    accessScope?: ChatSessionAccessScope;
    signal?: AbortSignal;
    onEvent: (event: EmployeeChatStreamEvent) => void | Promise<void>;
  }): Promise<{ runId: string; sessionKey: string; reply: string }> {
    if (isConversationResetCommand(params.message)) {
      return await this.createFreshChatSessionFromCommand(params);
    }
    const { sessionRepo, messageRepo } = this.requireChatPersistence();
    const { employee, workspace, skillNames } = await this.prepareRuntime(params.employeeId);
    const session = await this.resolveChatSession(employee.id, params.sessionKey, {
      actorUserId: params.actorUserId,
      accessScope: params.accessScope,
    });
    const run = await this.runRepo.create({
      employeeId: employee.id,
      triggerType: "manual",
      triggerSource: "chat",
      sessionKey: session.sessionKey
    });
    const userMessageCreatedAt = normalizeChatMessageTimestamp();
    const uploadService = new EmployeeUploadFileService(this.employeeRepo, messageRepo, this.gateway.homeDir);
    const normalizedAttachments = normalizeChatAttachments(params.attachments);
    const attachmentSnapshots = normalizedAttachments.map((attachment) => ({
      ...attachment,
      sourceText: params.message,
      sourceSessionKey: session.sessionKey,
      sourceMessageId: randomUUID()
    }));
    for (const attachment of attachmentSnapshots) {
      await uploadService.readUploadedFile({
        employeeId: employee.id,
        relativePath: attachment.relativePath,
        rawUrl: "",
        downloadUrl: ""
      });
    }
    const userMessageId = attachmentSnapshots[0]?.sourceMessageId ?? randomUUID();
    const userMessageAttachments = attachmentSnapshots.map((attachment) => ({
      ...attachment,
      sourceMessageId: userMessageId
    }));
    await messageRepo.createMany([{
      id: userMessageId,
      sessionId: session.id,
      role: "user",
      content: params.message,
      createdAt: userMessageCreatedAt,
      metadata: {
        runId: run.id,
        runStatus: RunStatus.Running,
        ...(userMessageAttachments.length > 0 ? { attachments: userMessageAttachments } : {})
      }
    }]);
    await sessionRepo.touchWithMessage({
      sessionId: session.id,
      messageCountIncrement: 1,
      latestContent: params.message,
      titleSeed: params.message,
      updatedByUserId: params.actorUserId,
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
    let streamedProcessTimeline: ChatProcessTimelineEntry[] = [];
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

    let enrichedMessage = buildAttachmentPromptText(params.message, userMessageAttachments);
    if (params.actorUserId && this.identityResolver) {
      try {
        const identity = await this.identityResolver.resolveByInternalId(params.actorUserId);
        const prefix = IdentityResolver.buildSenderPrefix(identity, params.actorUserId);
        enrichedMessage = `${prefix}\n${enrichedMessage}`;
      } catch {
        // identity resolution failure should not block the chat
      }
    }

    try {
      const result = await this.gateway.runEmployeeTurn({
        employeeId: employee.id,
        agentId: employee.code,
        sessionKey: session.sessionKey,
        workspace,
        message: enrichedMessage,
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
            streamedProcessTimeline = appendReasoningTimelineEntry(
              streamedProcessTimeline,
              message.reasoning_content,
              buildTimelineTimestamp()
            );
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
              streamedProcessTimeline = upsertToolCallTimelineEntry(
                streamedProcessTimeline,
                nextToolCall,
                buildTimelineTimestamp()
              );
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
            const toolOutput = normalizeChatMessageContent(message.content);
            streamedToolResults = mergeToolResultMessages(streamedToolResults, {
              role: "tool",
              content: toolOutput,
              ...(typeof message.tool_call_id === "string" ? { toolCallId: message.tool_call_id } : {}),
              ...(typeof message.name === "string" ? { toolName: message.name } : {})
            });
            streamedProcessTimeline = upsertToolResultTimelineEntry(
              streamedProcessTimeline,
              {
                toolCallId: typeof message.tool_call_id === "string" ? message.tool_call_id : undefined,
                name: typeof message.name === "string" ? message.name : "工具结果",
                output: toolOutput
              },
              buildTimelineTimestamp()
            );
            void emit({
              event: "tool_result",
              data: {
                runId: run.id,
                toolCallId: typeof message.tool_call_id === "string" ? message.tool_call_id : undefined,
                name: typeof message.name === "string" ? message.name : "工具结果",
                output: toolOutput
              }
            });
          }
        },
        abortSignal: abortController.signal
      });

      const completedProcessTimeline = streamedProcessTimeline.length > 0
        ? upsertReplyTimelineEntry(streamedProcessTimeline, result.reply, buildTimelineTimestamp())
        : buildProcessTimelineFromSessionMessages(result.newMessages);
      const persistedMessages = await this.persistChatMessages(
        session.id,
        attachProcessTimelineToAssistantMessage(result.newMessages, completedProcessTimeline),
        {
        runId: run.id,
        runStatus: RunStatus.Completed
        }
      );
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
        const abortedProcessTimeline = upsertReplyTimelineEntry(streamedProcessTimeline, partialReply, buildTimelineTimestamp());
        const persistedMessages = await this.persistChatMessages(session.id, attachProcessTimelineToAssistantMessage(abortedMessages, abortedProcessTimeline), {
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
      const failedMessages = buildFailedStreamMessages({
        partialReply: deltaParts.join(""),
        reasoning: streamedReasoning,
        toolCalls: streamedToolCalls,
        toolResults: streamedToolResults,
        errorMessage: classified.message
      });
      const failedProcessTimeline = upsertReplyTimelineEntry(streamedProcessTimeline, deltaParts.join(""), buildTimelineTimestamp());
      const persistedMessages = await this.persistChatMessages(session.id, attachProcessTimelineToAssistantMessage(failedMessages, failedProcessTimeline), {
        runId: run.id,
        runStatus: RunStatus.Failed
      });
      if (persistedMessages.length > 0) {
        await sessionRepo.touchWithMessage({
          sessionId: session.id,
          messageCountIncrement: persistedMessages.length,
          latestContent: pickLatestPreview(failedMessages, buildChatFailureMessage(classified.message)),
          titleSeed: params.message
        });
      }
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

  private async createFreshChatSessionFromCommand(params: {
    employeeId: string;
    actorUserId?: string;
    onEvent: (event: EmployeeChatStreamEvent) => void | Promise<void>;
  }): Promise<{ runId: string; sessionKey: string; reply: string }> {
    const session = await this.createChatSession(params.employeeId, params.actorUserId);
    const runId = `chat-command-${randomUUID()}`;
    await params.onEvent({
      event: "run_started",
      data: {
        runId,
        sessionKey: session.sessionKey
      }
    });
    await params.onEvent({
      event: "done",
      data: {
        runId,
        sessionKey: session.sessionKey,
        status: RunStatus.Completed
      }
    });
    return {
      runId,
      sessionKey: session.sessionKey,
      reply: ""
    };
  }


  async runEmployeeTurn(params: {
    employeeId: string;
    message: string;
    triggerType: string;
    triggerSource: string;
    sessionKey?: string;
    sessionTitle?: string;
    actorUserId?: string;
  }): Promise<EmployeeTurnResult> {
    const { employee, workspace, skillNames } = await this.prepareRuntime(params.employeeId);
    const persistence = this.chatSessionRepo && this.chatMessageRepo
      ? this.requireChatPersistence()
      : null;
    const automatedChatSession = persistence && params.triggerType === "scheduled"
      ? await this.resolveChatSession(employee.id, params.sessionKey, {
          createIfMissing: true,
          title: params.sessionTitle,
          actorUserId: params.actorUserId
        })
      : null;

    const message = params.message;

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
        message,
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
      if (automatedChatSession && persistence) {
        const failedMessages = buildFailedAutomationMessages({
          errorMessage: classified.message
        });
        const persistedMessages = await this.persistChatMessages(automatedChatSession.id, failedMessages, {
          runId: run.id,
          runStatus: RunStatus.Failed
        });
        if (persistedMessages.length > 0) {
          await persistence.sessionRepo.touchWithMessage({
            sessionId: automatedChatSession.id,
            messageCountIncrement: persistedMessages.length,
            latestContent: pickLatestPreview(failedMessages, buildChatFailureMessage(classified.message)),
            titleSeed: params.sessionTitle ?? params.message
          });
        }
      }
      await this.runRepo.complete(run.id, {
        status: RunStatus.Failed,
        summary: String(error),
        result: {
          error: classified.toJSON(),
          ...(automatedChatSession?.sessionKey ? { sessionKey: automatedChatSession.sessionKey } : {})
        }
      });
      throw classified;
    }
  }
}
