import {
  buildChatFailureMessage,
  formatRunStatusMeta,
  type ChatAttachmentView,
  type ChatMessageView,
  type ChatProcessTimelineEntry
} from "../../shared/ui-models";
import { isConversationResetCommand } from "../../shared/chat-command";
import { mergePersistedAndOverlay, prunePersistedMatchesFromOverlay } from "./chat-message-merge";
import {
  createLocalDraftChatSession,
  isDraftChatSessionKey,
  shouldCommitLocalChatSessionUpdate,
  upsertLocalChatSession,
  type LocalChatSessionListItem
} from "./chat-post-run-refresh";
import { resolveInitialChatSelection } from "./chat-session-bootstrap";
import {
  deleteChatRuntimeHandle,
  getChatRuntimeHandle,
  renameChatRuntimeHandle,
  setChatRuntimeHandle
} from "./chat-runtime-registry";

export type ChatSessionListItem = LocalChatSessionListItem;

export type ChatRunPhase = "idle" | "preparing" | "streaming" | "completed" | "aborted" | "failed";

export type ChatSessionRealtimeState = {
  sessionKey: string;
  persistedMessages: ChatMessageView[];
  overlayMessages: ChatMessageView[];
  nextCursor: string | null;
  loadStatus: "idle" | "loading" | "loaded" | "error";
  loadingMoreMessages: boolean;
  requestVersion: number;
  runPhase: ChatRunPhase;
  activeRunId: string;
  streamingAssistantId: string | null;
  lastError: string;
  lastTouchedAt: string;
  hydratedAt: string | null;
};

export type EmployeeChatStoreState = {
  selectedSessionKey: string;
  sessions: ChatSessionListItem[];
  sessionNextCursor: string | null;
  loadingSessions: boolean;
  loadingMoreSessions: boolean;
  pendingUploads: ChatAttachmentView[];
  sessionStateByKey: Record<string, ChatSessionRealtimeState>;
};

type SessionListPayload = {
  ok: boolean;
  data: {
    items: ChatSessionListItem[];
    nextCursor: string | null;
  };
};

type SessionMessagesPayload = {
  ok: boolean;
  data: {
    sessionKey: string;
    items: ChatMessageView[];
    nextCursor: string | null;
  };
};

type StreamEvent =
  | { event: "run_started"; data: { runId: string; sessionKey: string } }
  | { event: "thinking"; data: { runId: string; content?: string } }
  | { event: "tool_call"; data: { runId: string; toolCallId?: string; name: string; args: string } }
  | { event: "tool_result"; data: { runId: string; toolCallId?: string; name: string; output: string } }
  | { event: "reply_delta"; data: { runId: string; delta: string } }
  | { event: "reply_final"; data: { runId: string; content: string } }
  | { event: "run_failed"; data: { runId: string; message: string } }
  | { event: "run_aborted"; data: { runId: string; reason: string } }
  | { event: "done"; data: { runId: string; sessionKey: string; status: string } };

const SESSION_PAGE_SIZE = 30;
const employeeChatControllers = new Map<string, EmployeeChatStoreController>();

function createNowIso(): string {
  return new Date().toISOString();
}

function makeLocalId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function phaseFromTerminalStatus(status?: string | null): ChatRunPhase {
  if (status === "completed") {
    return "completed";
  }
  if (status === "aborted") {
    return "aborted";
  }
  return "failed";
}

function tryParseJson(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

function parseSseFrame(frame: string): StreamEvent | null {
  const lines = frame.split("\n");
  let eventName = "";
  const dataLines: string[] = [];
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line || line.startsWith(":")) {
      continue;
    }
    if (line.startsWith("event:")) {
      eventName = line.slice(6).trim();
      continue;
    }
    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trimStart());
    }
  }
  if (!eventName) {
    return null;
  }
  const rawData = dataLines.join("\n");
  const parsed = rawData ? JSON.parse(rawData) : {};
  return { event: eventName as StreamEvent["event"], data: parsed } as StreamEvent;
}

function mergeProgressText(existing: string | undefined, incoming: string | undefined): string | undefined {
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

function mergeTerminalMessage(existing: string, incoming: string): string {
  const nextText = incoming.trim();
  if (!nextText) {
    return existing;
  }
  const currentText = existing.trim();
  if (!currentText) {
    return nextText;
  }
  if (currentText.includes(nextText)) {
    return currentText;
  }
  return `${currentText}\n\n${nextText}`;
}

function upsertProcessTimelineEntry(message: ChatMessageView, entry: ChatProcessTimelineEntry): ChatMessageView {
  const currentTimeline = message.processTimeline ?? [];
  const existingIndex = currentTimeline.findIndex((item) => item.id === entry.id);
  if (existingIndex === -1) {
    return {
      ...message,
      processTimeline: [...currentTimeline, entry]
    };
  }
  const nextTimeline = [...currentTimeline];
  nextTimeline[existingIndex] = {
    ...nextTimeline[existingIndex],
    ...entry
  };
  return {
    ...message,
    processTimeline: nextTimeline
  };
}

function upsertStreamingReplyTimeline(message: ChatMessageView, content: string): ChatMessageView {
  const trimmedContent = content.trim();
  if (!trimmedContent) {
    return message;
  }
  return upsertProcessTimelineEntry(message, {
    id: `${message.id ?? "assistant"}-reply-live`,
    kind: "reply",
    timestamp: createNowIso(),
    content: trimmedContent
  });
}

function upsertStreamingReasoningTimeline(message: ChatMessageView, content: string): ChatMessageView {
  const trimmedContent = content.trim();
  if (!trimmedContent) {
    return message;
  }
  return {
    ...message,
    processTimeline: [
      ...(message.processTimeline ?? []),
      {
        id: makeLocalId(`${message.id ?? "assistant"}-reasoning`),
        kind: "reasoning",
        timestamp: createNowIso(),
        content: trimmedContent
      }
    ]
  };
}

function appendStreamingToolCallTimeline(message: ChatMessageView, params: {
  toolCallId?: string;
  name: string;
  args: string;
}): ChatMessageView {
  return upsertProcessTimelineEntry(message, {
    id: params.toolCallId || makeLocalId("tool-call-timeline"),
    kind: "tool_call",
    timestamp: createNowIso(),
    name: params.name,
    ...(params.toolCallId ? { toolCallId: params.toolCallId } : {}),
    arguments: params.args
  });
}

function appendStreamingToolResultTimeline(message: ChatMessageView, params: {
  toolCallId?: string;
  name: string;
  output: string;
}): ChatMessageView {
  return upsertProcessTimelineEntry(message, {
    id: params.toolCallId
      ? `${params.toolCallId}-result`
      : makeLocalId("tool-result-timeline"),
    kind: "tool_result",
    timestamp: createNowIso(),
    name: params.name,
    ...(params.toolCallId ? { toolCallId: params.toolCallId } : {}),
    output: params.output
  });
}

function mergeSessionPage(existing: ChatSessionListItem[], incoming: ChatSessionListItem[]): ChatSessionListItem[] {
  if (existing.length === 0) {
    return incoming;
  }
  const existingKeys = new Set(existing.map((session) => session.sessionKey));
  return [...existing, ...incoming.filter((session) => !existingKeys.has(session.sessionKey))];
}

function mergeLatestSessionPage(existing: ChatSessionListItem[], incoming: ChatSessionListItem[]): ChatSessionListItem[] {
  if (existing.length === 0) {
    return incoming;
  }
  const nextByKey = new Map(incoming.map((session) => [session.sessionKey, session]));
  const preserved = existing.filter((session) => !nextByKey.has(session.sessionKey));
  return [...incoming, ...preserved];
}

function buildSessionSyncToken(session?: ChatSessionListItem | null): string {
  if (!session) {
    return "";
  }
  return [session.updatedAt, String(session.messageCount), session.lastMessageAt ?? ""].join("|");
}

function createSessionRealtimeState(sessionKey: string): ChatSessionRealtimeState {
  return {
    sessionKey,
    persistedMessages: [],
    overlayMessages: [],
    nextCursor: null,
    loadStatus: "idle",
    loadingMoreMessages: false,
    requestVersion: 0,
    runPhase: "idle",
    activeRunId: "",
    streamingAssistantId: null,
    lastError: "",
    lastTouchedAt: createNowIso(),
    hydratedAt: null
  };
}

export function createEmployeeChatStoreState(): EmployeeChatStoreState {
  return {
    selectedSessionKey: "",
    sessions: [],
    sessionNextCursor: null,
    loadingSessions: false,
    loadingMoreSessions: false,
    pendingUploads: [],
    sessionStateByKey: {}
  };
}

export class EmployeeChatStoreController {
  private readonly messageLoadControllers = new Map<string, AbortController>();

  constructor(
    public readonly employeeId: string,
    public state: EmployeeChatStoreState
  ) {}

  getDisplayMessages(sessionKey = this.state.selectedSessionKey): ChatMessageView[] {
    const sessionState = this.getSessionState(sessionKey);
    if (!sessionState) {
      return [];
    }
    return mergePersistedAndOverlay(sessionState.persistedMessages, sessionState.overlayMessages);
  }

  getSessionState(sessionKey: string): ChatSessionRealtimeState | null {
    return this.state.sessionStateByKey[sessionKey] ?? null;
  }

  getSelectedSessionState(): ChatSessionRealtimeState | null {
    if (!this.state.selectedSessionKey) {
      return null;
    }
    return this.ensureSessionState(this.state.selectedSessionKey);
  }

  ensureSessionState(sessionKey: string): ChatSessionRealtimeState {
    const existing = this.state.sessionStateByKey[sessionKey];
    if (existing) {
      return existing;
    }
    const nextState = createSessionRealtimeState(sessionKey);
    this.state.sessionStateByKey = {
      ...this.state.sessionStateByKey,
      [sessionKey]: nextState
    };
    return nextState;
  }

  setPendingUploads(items: ChatAttachmentView[]) {
    this.state.pendingUploads = items;
  }

  appendPendingUploads(items: ChatAttachmentView[]) {
    if (items.length === 0) {
      return;
    }
    const existing = new Set(this.state.pendingUploads.map((item) => item.relativePath));
    this.state.pendingUploads = [
      ...this.state.pendingUploads,
      ...items.filter((item) => !existing.has(item.relativePath))
    ];
  }

  removePendingUpload(relativePath: string) {
    this.state.pendingUploads = this.state.pendingUploads.filter((item) => item.relativePath !== relativePath);
  }

  async fetchSessions(options?: { append?: boolean; preserveExisting?: boolean }): Promise<ChatSessionListItem[]> {
    const append = options?.append ?? false;
    const preserveExisting = options?.preserveExisting ?? false;
    if (append && !this.state.sessionNextCursor) {
      return [];
    }
    if (append) {
      this.state.loadingMoreSessions = true;
    } else {
      this.state.loadingSessions = true;
    }
    try {
      const query = new URLSearchParams({ limit: String(SESSION_PAGE_SIZE) });
      if (append && this.state.sessionNextCursor) {
        query.set("before", this.state.sessionNextCursor);
      }
      const response = await $fetch<SessionListPayload>(`/api/employees/${this.employeeId}/sessions?${query.toString()}`);
      this.state.sessionNextCursor = response.data.nextCursor;
      this.state.sessions = append
        ? mergeSessionPage(this.state.sessions, response.data.items)
        : preserveExisting
          ? mergeLatestSessionPage(this.state.sessions, response.data.items)
          : response.data.items;
      return response.data.items;
    } finally {
      this.state.loadingSessions = false;
      this.state.loadingMoreSessions = false;
    }
  }

  async loadMoreSessions() {
    if (this.state.loadingSessions || this.state.loadingMoreSessions || !this.state.sessionNextCursor) {
      return;
    }
    await this.fetchSessions({ append: true });
  }

  async initializeChat() {
    const items = await this.fetchSessions();
    const initialSelection = resolveInitialChatSelection({
      activeSessionKey: this.state.selectedSessionKey,
      sessions: items
    });
    this.state.selectedSessionKey = initialSelection.sessionKey;
    if (!initialSelection.shouldLoadMessages) {
      return;
    }
    const sessionState = this.ensureSessionState(initialSelection.sessionKey);
    const hasDisplayMessages = this.getDisplayMessages(initialSelection.sessionKey).length > 0;
    if (this.isSessionInProgress(initialSelection.sessionKey)) {
      if (sessionState.persistedMessages.length === 0 && sessionState.loadStatus === "idle") {
        void this.loadPersistedMessages(initialSelection.sessionKey, { silent: true });
      }
      return;
    }
    if (hasDisplayMessages || sessionState.hydratedAt) {
      if (!sessionState.hydratedAt && sessionState.loadStatus === "idle") {
        void this.loadPersistedMessages(initialSelection.sessionKey, { silent: true });
      }
      return;
    }
    await this.loadPersistedMessages(initialSelection.sessionKey);
  }

  async selectSession(sessionKey: string) {
    if (!sessionKey || sessionKey === this.state.selectedSessionKey) {
      return;
    }
    this.state.selectedSessionKey = sessionKey;
    const sessionState = this.ensureSessionState(sessionKey);
    if (!isDraftChatSessionKey(sessionKey) && !sessionState.hydratedAt && sessionState.loadStatus !== "loading") {
      await this.loadPersistedMessages(sessionKey);
    }
  }

  async createSession(selectAfterCreate = true): Promise<string> {
    const existingDraft = this.state.sessions.find((session) => session.isDraft);
    const draftSession = existingDraft ?? createLocalDraftChatSession(createNowIso());
    if (!existingDraft) {
      this.state.sessions = [draftSession, ...this.state.sessions];
    }
    const sessionState = this.ensureSessionState(draftSession.sessionKey);
    sessionState.persistedMessages = [];
    sessionState.overlayMessages = [];
    sessionState.nextCursor = null;
    sessionState.loadStatus = "loaded";
    sessionState.loadingMoreMessages = false;
    sessionState.runPhase = "idle";
    sessionState.activeRunId = "";
    sessionState.streamingAssistantId = null;
    sessionState.lastError = "";
    sessionState.hydratedAt = createNowIso();
    if (selectAfterCreate) {
      this.state.selectedSessionKey = draftSession.sessionKey;
    }
    return draftSession.sessionKey;
  }

  async loadOlderMessages() {
    const sessionKey = this.state.selectedSessionKey;
    const sessionState = sessionKey ? this.getSessionState(sessionKey) : null;
    if (!sessionKey || !sessionState?.nextCursor || sessionState.loadingMoreMessages) {
      return;
    }
    await this.loadPersistedMessages(sessionKey, { before: sessionState.nextCursor });
  }

  async loadPersistedMessages(sessionKey: string, options?: { before?: string | null; silent?: boolean }) {
    if (!sessionKey || isDraftChatSessionKey(sessionKey)) {
      return;
    }
    const sessionState = this.ensureSessionState(sessionKey);
    const before = options?.before ?? null;
    const silent = options?.silent ?? false;
    const requestVersion = before ? sessionState.requestVersion : sessionState.requestVersion + 1;
    let controller: AbortController | null = null;
    if (before) {
      sessionState.loadingMoreMessages = true;
    } else {
      this.messageLoadControllers.get(sessionKey)?.abort();
      controller = new AbortController();
      this.messageLoadControllers.set(sessionKey, controller);
      sessionState.requestVersion = requestVersion;
      if (!silent) {
        sessionState.loadStatus = "loading";
      }
    }
    try {
      const query = new URLSearchParams({ limit: "50" });
      if (before) {
        query.set("before", before);
      }
      const response = await $fetch<SessionMessagesPayload>(
        `/api/employees/${this.employeeId}/sessions/${encodeURIComponent(sessionKey)}/messages?${query.toString()}`,
        controller ? { signal: controller.signal } : undefined
      );
      const latestState = this.ensureSessionState(sessionKey);
      if (!before && latestState.requestVersion !== requestVersion) {
        return;
      }
      latestState.nextCursor = response.data.nextCursor;
      latestState.persistedMessages = before
        ? [...response.data.items, ...latestState.persistedMessages]
        : response.data.items;
      latestState.overlayMessages = prunePersistedMatchesFromOverlay(
        latestState.persistedMessages,
        latestState.overlayMessages
      );
      latestState.hydratedAt = createNowIso();
      latestState.loadStatus = "loaded";
      latestState.lastTouchedAt = createNowIso();
    } catch (error) {
      if (controller?.signal.aborted) {
        return;
      }
      const latestState = this.ensureSessionState(sessionKey);
      latestState.loadStatus = "error";
      latestState.lastError = error instanceof Error ? error.message : String(error);
    } finally {
      const latestState = this.ensureSessionState(sessionKey);
      latestState.loadingMoreMessages = false;
      if (controller && this.messageLoadControllers.get(sessionKey) === controller) {
        this.messageLoadControllers.delete(sessionKey);
      }
    }
  }

  async syncChatWithExternalRuns() {
    const activeSessionBeforeSync = this.state.sessions.find((session) => session.sessionKey === this.state.selectedSessionKey) ?? null;
    const activeSessionTokenBeforeSync = buildSessionSyncToken(activeSessionBeforeSync);
    await this.fetchSessions({ preserveExisting: true });

    if (!this.state.selectedSessionKey || isDraftChatSessionKey(this.state.selectedSessionKey)) {
      return;
    }
    if (this.isSessionInProgress(this.state.selectedSessionKey)) {
      return;
    }

    const activeSessionAfterSync = this.state.sessions.find((session) => session.sessionKey === this.state.selectedSessionKey) ?? null;
    const activeSessionTokenAfterSync = buildSessionSyncToken(activeSessionAfterSync);
    if (activeSessionTokenAfterSync && activeSessionTokenAfterSync !== activeSessionTokenBeforeSync) {
      await this.loadPersistedMessages(this.state.selectedSessionKey);
    }
  }

  async cancelRun(sessionKey = this.state.selectedSessionKey) {
    if (!sessionKey) {
      return;
    }
    const runtimeHandle = getChatRuntimeHandle(this.employeeId, sessionKey);
    if (!runtimeHandle) {
      return;
    }
    if (!runtimeHandle.activeRunId) {
      runtimeHandle.abortController.abort();
      return;
    }
    try {
      const result = await $fetch<{ ok: boolean; data: { stopped: boolean } }>(
        `/api/employees/${this.employeeId}/chat/${runtimeHandle.activeRunId}/cancel`,
        { method: "POST" }
      );
      if (!result.data.stopped) {
        runtimeHandle.abortController.abort();
      }
    } catch {
      runtimeHandle.abortController.abort();
    }
  }

  // eslint-disable-next-line max-lines-per-function
  async sendMessage(input: string) {
    const message = input.trim();
    if (!message) {
      return;
    }
    if (isConversationResetCommand(message)) {
      this.state.pendingUploads = [];
      await this.createSession(true);
      return;
    }

    const baseSessionKey = this.state.selectedSessionKey || await this.createSession(true);
    let currentSessionKey = baseSessionKey;
    const sessionState = this.ensureSessionState(currentSessionKey);
    if (sessionState.runPhase === "preparing" || sessionState.runPhase === "streaming") {
      return;
    }

    const attachments = this.state.pendingUploads.map((item) => ({ ...item }));
    this.state.pendingUploads = [];

    const previousDisplayCount = this.getDisplayMessages(currentSessionKey).length;
    const draftSessionKey = isDraftChatSessionKey(currentSessionKey) ? currentSessionKey : "";
    const persistedActiveSessionKey = draftSessionKey ? "" : currentSessionKey;
    const optimisticMessage: ChatMessageView = {
      id: makeLocalId("user"),
      role: "user",
      content: message,
      ...(attachments.length > 0 ? { attachments } : {}),
      timestamp: createNowIso()
    };

    this.appendOverlayMessage(currentSessionKey, optimisticMessage);
    sessionState.runPhase = "preparing";
    sessionState.lastError = "";
    sessionState.activeRunId = "";

    const controller = new AbortController();
    let finalSessionKey = persistedActiveSessionKey || currentSessionKey;
    let terminalStatus: string | null = null;
    let acceptedByServer = false;

    const streamTask = (async () => {
      try {
        const response = await fetch(`/api/employees/${this.employeeId}/chat`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "text/event-stream"
          },
          body: JSON.stringify({
            message,
            attachments,
            ...(persistedActiveSessionKey ? { sessionKey: persistedActiveSessionKey } : {})
          }),
          signal: controller.signal
        });

        if (!response.ok) {
          throw new Error((await response.text()).trim() || `HTTP ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error("流式响应不可用");
        }

        const decoder = new TextDecoder();
        let buffer = "";

        const consumeEvent = async (streamEvent: StreamEvent) => {
          switch (streamEvent.event) {
            case "run_started": {
              acceptedByServer = true;
              finalSessionKey = streamEvent.data.sessionKey || finalSessionKey;
              if (finalSessionKey && finalSessionKey !== currentSessionKey) {
                currentSessionKey = this.rekeySessionState(currentSessionKey, finalSessionKey);
              }
              const nextSessionState = this.ensureSessionState(currentSessionKey);
              nextSessionState.activeRunId = streamEvent.data.runId;
              nextSessionState.runPhase = "streaming";
              const runtimeHandle = getChatRuntimeHandle(this.employeeId, currentSessionKey);
              if (runtimeHandle) {
                setChatRuntimeHandle({
                  ...runtimeHandle,
                  activeRunId: streamEvent.data.runId
                });
              }
              break;
            }
            case "thinking": {
              const assistantMessage = this.ensureStreamingAssistantMessage(currentSessionKey);
              const nextReasoning = mergeProgressText(assistantMessage.reasoning, streamEvent.data.content);
              this.replaceOverlayMessage(currentSessionKey, {
                ...upsertStreamingReasoningTimeline(assistantMessage, streamEvent.data.content ?? ""),
                reasoning: nextReasoning
              });
              break;
            }
            case "tool_call": {
              const assistantMessage = this.ensureStreamingAssistantMessage(currentSessionKey);
              const toolCalls = assistantMessage.toolCalls ?? [];
              this.replaceOverlayMessage(currentSessionKey, {
                ...appendStreamingToolCallTimeline(assistantMessage, streamEvent.data),
                toolCalls: [
                  ...toolCalls,
                  {
                    id: streamEvent.data.toolCallId ?? makeLocalId("tool-call"),
                    name: streamEvent.data.name,
                    arguments: tryParseJson(streamEvent.data.args)
                  }
                ]
              });
              break;
            }
            case "tool_result": {
              const assistantMessage = this.ensureStreamingAssistantMessage(currentSessionKey);
              this.replaceOverlayMessage(currentSessionKey, appendStreamingToolResultTimeline(assistantMessage, streamEvent.data));
              break;
            }
            case "reply_delta": {
              const assistantMessage = this.ensureStreamingAssistantMessage(currentSessionKey);
              const nextContent = `${assistantMessage.content}${streamEvent.data.delta}`;
              this.replaceOverlayMessage(currentSessionKey, {
                ...upsertStreamingReplyTimeline(assistantMessage, nextContent),
                content: nextContent
              });
              break;
            }
            case "reply_final": {
              const assistantMessage = this.ensureStreamingAssistantMessage(currentSessionKey);
              this.replaceOverlayMessage(currentSessionKey, {
                ...upsertStreamingReplyTimeline(assistantMessage, streamEvent.data.content),
                content: streamEvent.data.content
              });
              break;
            }
            case "run_failed": {
              terminalStatus = "failed";
              const failureMessage = buildChatFailureMessage(streamEvent.data.message);
              const nextSessionState = this.ensureSessionState(currentSessionKey);
              nextSessionState.lastError = failureMessage;
              nextSessionState.runPhase = "failed";
              this.applyStreamingTerminalState(currentSessionKey, "failed", failureMessage);
              break;
            }
            case "run_aborted": {
              terminalStatus = "aborted";
              const nextSessionState = this.ensureSessionState(currentSessionKey);
              nextSessionState.lastError = "本次对话已取消";
              nextSessionState.runPhase = "aborted";
              this.applyStreamingTerminalState(currentSessionKey, "aborted", "本次对话已取消");
              break;
            }
            case "done": {
              terminalStatus = streamEvent.data.status || terminalStatus;
              finalSessionKey = streamEvent.data.sessionKey || finalSessionKey;
              if (finalSessionKey && finalSessionKey !== currentSessionKey) {
                currentSessionKey = this.rekeySessionState(currentSessionKey, finalSessionKey);
              }
              const nextSessionState = this.ensureSessionState(currentSessionKey);
              nextSessionState.runPhase = phaseFromTerminalStatus(streamEvent.data.status || terminalStatus);
              if (streamEvent.data.status) {
                this.applyStreamingTerminalState(currentSessionKey, streamEvent.data.status);
              }
              break;
            }
          }
        };

        try {
          let reading = true;
          while (reading) {
            const { done, value } = await reader.read();
            if (done) {
              reading = false;
              continue;
            }
            buffer += decoder.decode(value, { stream: true });
            let boundary = buffer.indexOf("\n\n");
            while (boundary !== -1) {
              const frame = buffer.slice(0, boundary);
              buffer = buffer.slice(boundary + 2);
              const parsed = parseSseFrame(frame);
              if (parsed) {
                await consumeEvent(parsed);
              }
              boundary = buffer.indexOf("\n\n");
            }
          }
          if (buffer.trim()) {
            const parsed = parseSseFrame(buffer);
            if (parsed) {
              await consumeEvent(parsed);
            }
          }
        } finally {
          reader.releaseLock();
        }

        this.removeEmptyStreamingAssistantMessage(currentSessionKey);
        const latestDisplayCount = this.getDisplayMessages(currentSessionKey).length;
        if (shouldCommitLocalChatSessionUpdate(terminalStatus)) {
          this.state.sessions = upsertLocalChatSession({
            sessions: this.state.sessions,
            sessionKey: currentSessionKey,
            previousSessionKey: draftSessionKey || undefined,
            latestContent: this.getLatestSessionPreviewFallback(currentSessionKey, message),
            occurredAt: createNowIso(),
            titleSeed: message,
            messageCountIncrement: Math.max(0, latestDisplayCount - previousDisplayCount)
          });
        }
        if (currentSessionKey) {
          await this.fetchSessions({ preserveExisting: true });
          await this.loadPersistedMessages(currentSessionKey, {
            silent: this.isSessionInProgress(currentSessionKey)
          });
        }
      } catch (error) {
        const nextSessionState = this.ensureSessionState(currentSessionKey);
        if (controller.signal.aborted) {
          nextSessionState.runPhase = "aborted";
          if (!nextSessionState.lastError) {
            nextSessionState.lastError = "本次对话已取消";
          }
          if (currentSessionKey) {
            await this.fetchSessions({ preserveExisting: true });
            await this.loadPersistedMessages(currentSessionKey, { silent: true });
          } else {
            this.removeOverlayMessage(currentSessionKey, optimisticMessage.id ?? "");
          }
        } else {
          const failureMessage = buildChatFailureMessage(error instanceof Error ? error.message : String(error));
          nextSessionState.lastError = failureMessage;
          nextSessionState.runPhase = "failed";
          if (currentSessionKey) {
            await this.fetchSessions({ preserveExisting: true });
            await this.loadPersistedMessages(currentSessionKey, { silent: true });
            if (!acceptedByServer) {
              this.appendLocalTerminalMessage(currentSessionKey, "failed", failureMessage);
            }
          } else {
            this.removeOverlayMessage(currentSessionKey, optimisticMessage.id ?? "");
            this.appendLocalTerminalMessage(currentSessionKey, "failed", failureMessage);
          }
        }
        if (!acceptedByServer) {
          this.state.pendingUploads = attachments;
        }
      } finally {
        const nextSessionState = this.ensureSessionState(currentSessionKey);
        this.removeEmptyStreamingAssistantMessage(currentSessionKey);
        nextSessionState.activeRunId = "";
        nextSessionState.streamingAssistantId = null;
        if (nextSessionState.runPhase === "preparing") {
          nextSessionState.runPhase = controller.signal.aborted ? "aborted" : "idle";
        }
        deleteChatRuntimeHandle(this.employeeId, currentSessionKey);
      }
    })();

    setChatRuntimeHandle({
      employeeId: this.employeeId,
      sessionKey: currentSessionKey,
      abortController: controller,
      activeRunId: "",
      streamTask
    });

    await streamTask;
  }

  rekeySessionState(previousSessionKey: string, nextSessionKey: string): string {
    if (!previousSessionKey || !nextSessionKey || previousSessionKey === nextSessionKey) {
      return nextSessionKey || previousSessionKey;
    }
    const previousState = this.ensureSessionState(previousSessionKey);
    const existingTarget = this.state.sessionStateByKey[nextSessionKey];
    const nextState: ChatSessionRealtimeState = {
      ...(existingTarget ?? createSessionRealtimeState(nextSessionKey)),
      ...previousState,
      sessionKey: nextSessionKey,
      persistedMessages: existingTarget?.persistedMessages.length
        ? existingTarget.persistedMessages
        : previousState.persistedMessages,
      overlayMessages: previousState.overlayMessages,
      nextCursor: previousState.nextCursor,
      hydratedAt: previousState.hydratedAt
    };
    const nextSessionStateByKey = { ...this.state.sessionStateByKey };
    delete nextSessionStateByKey[previousSessionKey];
    nextSessionStateByKey[nextSessionKey] = nextState;
    this.state.sessionStateByKey = nextSessionStateByKey;
    this.state.sessions = this.state.sessions.map((session) => (
      session.sessionKey === previousSessionKey
        ? { ...session, sessionKey: nextSessionKey, isDraft: false }
        : session
    ));
    if (this.state.selectedSessionKey === previousSessionKey) {
      this.state.selectedSessionKey = nextSessionKey;
    }
    renameChatRuntimeHandle(this.employeeId, previousSessionKey, nextSessionKey);
    return nextSessionKey;
  }

  private isSessionInProgress(sessionKey: string): boolean {
    const sessionState = this.getSessionState(sessionKey);
    return sessionState?.runPhase === "preparing" || sessionState?.runPhase === "streaming";
  }

  private appendOverlayMessage(sessionKey: string, message: ChatMessageView) {
    const sessionState = this.ensureSessionState(sessionKey);
    sessionState.overlayMessages = [...sessionState.overlayMessages, message];
    sessionState.lastTouchedAt = createNowIso();
  }

  private replaceOverlayMessage(sessionKey: string, nextMessage: ChatMessageView) {
    const sessionState = this.ensureSessionState(sessionKey);
    sessionState.overlayMessages = sessionState.overlayMessages.map((message) => (
      message.id === nextMessage.id ? nextMessage : message
    ));
    sessionState.lastTouchedAt = createNowIso();
  }

  private removeOverlayMessage(sessionKey: string, messageId: string) {
    if (!sessionKey || !messageId) {
      return;
    }
    const sessionState = this.ensureSessionState(sessionKey);
    sessionState.overlayMessages = sessionState.overlayMessages.filter((message) => message.id !== messageId);
    sessionState.lastTouchedAt = createNowIso();
  }

  private ensureStreamingAssistantMessage(sessionKey: string): ChatMessageView {
    const sessionState = this.ensureSessionState(sessionKey);
    const existing = sessionState.streamingAssistantId
      ? sessionState.overlayMessages.find((message) => message.id === sessionState.streamingAssistantId)
      : null;
    if (existing) {
      return existing;
    }
    const nextMessage: ChatMessageView = {
      id: makeLocalId("assistant"),
      role: "assistant",
      content: "",
      timestamp: createNowIso()
    };
    sessionState.streamingAssistantId = nextMessage.id ?? null;
    sessionState.overlayMessages = [...sessionState.overlayMessages, nextMessage];
    return nextMessage;
  }

  private removeEmptyStreamingAssistantMessage(sessionKey: string) {
    const sessionState = this.ensureSessionState(sessionKey);
    const assistantId = sessionState.streamingAssistantId;
    if (!assistantId) {
      return;
    }
    const target = sessionState.overlayMessages.find((message) => message.id === assistantId);
    if (!target) {
      return;
    }
    const hasVisibleContent = Boolean(target.content.trim())
      || Boolean(target.reasoning?.trim())
      || Boolean(target.toolCalls?.length)
      || Boolean(target.processTimeline?.length)
      || Boolean(target.replyStatus);
    if (!hasVisibleContent) {
      sessionState.overlayMessages = sessionState.overlayMessages.filter((message) => message.id !== assistantId);
    }
  }

  private applyStreamingTerminalState(sessionKey: string, status: string, content?: string) {
    const assistantMessage = this.ensureStreamingAssistantMessage(sessionKey);
    const mergedContent = content?.trim()
      ? mergeTerminalMessage(assistantMessage.content, content)
      : assistantMessage.content;
    this.replaceOverlayMessage(sessionKey, {
      ...upsertStreamingReplyTimeline(assistantMessage, mergedContent),
      ...(mergedContent ? { content: mergedContent } : {}),
      replyStatus: formatRunStatusMeta(status)
    });
  }

  private appendLocalTerminalMessage(sessionKey: string, status: string, content: string) {
    this.appendOverlayMessage(sessionKey, {
      id: makeLocalId("assistant-terminal"),
      role: "assistant",
      content,
      replyStatus: formatRunStatusMeta(status),
      timestamp: createNowIso()
    });
  }

  private getLatestSessionPreviewFallback(sessionKey: string, fallback: string): string {
    const displayMessages = this.getDisplayMessages(sessionKey);
    for (let index = displayMessages.length - 1; index >= 0; index -= 1) {
      const candidate = displayMessages[index];
      if (candidate?.content?.trim()) {
        return candidate.content;
      }
    }
    return fallback;
  }
}

export function getOrCreateEmployeeChatStoreController(
  employeeId: string,
  state?: EmployeeChatStoreState
): EmployeeChatStoreController {
  const normalizedEmployeeId = employeeId.trim();
  const existing = employeeChatControllers.get(normalizedEmployeeId);
  if (existing) {
    if (state && existing.state !== state) {
      existing.state = state;
    }
    return existing;
  }
  const controller = new EmployeeChatStoreController(normalizedEmployeeId, state ?? createEmployeeChatStoreState());
  employeeChatControllers.set(normalizedEmployeeId, controller);
  return controller;
}

export function clearEmployeeChatStoreControllersForTest() {
  employeeChatControllers.clear();
}