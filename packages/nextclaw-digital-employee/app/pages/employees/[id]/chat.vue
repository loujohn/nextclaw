<script setup lang="ts">
import { formatRunStatusMeta, type ChatAttachmentView, type ChatMessageView } from "~~/shared/ui-models";
import type { UploadFilesPayload } from "~~/shared/api-types";
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { buildChatDisplayMessages } from "~/lib/chat-message-groups";
import { resolveInitialChatSelection } from "~/lib/chat-session-bootstrap";
import { renderMarkdown, formatTime } from "~/lib/utils";
import StatusBadge from "~/components/StatusBadge.vue";
import {
  createLocalDraftChatSession,
  isDraftChatSessionKey,
  refreshChatAfterRun,
  shouldCommitLocalChatSessionUpdate,
  upsertLocalChatSession,
  type LocalChatSessionListItem
} from "~/lib/chat-post-run-refresh";
import {
  AlertCircle,
  Bot,
  Brain,
  ChevronDown,
  ChevronRight,
  FolderOpen,
  Loader2,
  MessageCircle,
  Paperclip,
  Plus,
  Send,
  StopCircle,
  Terminal,
  User,
  Wrench,
  X
} from "lucide-vue-next";

type ChatSessionListItem = LocalChatSessionListItem;

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

const expandedProcess = ref<Set<string>>(new Set());

function toggleProcess(key: string) {
  const s = new Set(expandedProcess.value);
  s.has(key) ? s.delete(key) : s.add(key);
  expandedProcess.value = s;
}

function tryParseJson(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

function truncateStr(s: string, max = 200): string {
  return s.length > max ? `${s.slice(0, max)}…` : s;
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

function makeLocalId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
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

const route = useRoute();
const employeeId = computed(() => String(route.params.id));
const draft = ref("");
const sending = ref(false);
const loadingSessions = ref(false);
const loadingMoreSessions = ref(false);
const loadingMessages = ref(false);
const loadingMore = ref(false);
const errorMessage = ref("");
const messages = ref<ChatMessageView[]>([]);
const sessions = ref<ChatSessionListItem[]>([]);
const sessionNextCursor = ref<string | null>(null);
const activeSessionKey = ref("");
const nextCursor = ref<string | null>(null);
const activeRunId = ref("");
const threadEl = ref<HTMLElement | null>(null);
const sessionListEl = ref<HTMLElement | null>(null);
const textareaEl = ref<HTMLTextAreaElement | null>(null);
const fileInputEl = ref<HTMLInputElement | null>(null);
const streamAbortController = ref<AbortController | null>(null);
const streamingAssistantId = ref<string | null>(null);
const shouldStickToBottom = ref(true);
const restoringHistoryScroll = ref(false);
const suppressNextSessionLoad = ref(false);
const pendingUploads = ref<ChatAttachmentView[]>([]);
const uploadingFiles = ref(false);
const SESSION_PAGE_SIZE = 30;
const { data: employee, refresh: refreshEmployee } = useEmployeeDetail(employeeId);
const { refresh: refreshRuns } = useLazyFetch(`/api/employees/${employeeId.value}/runs`, {
  key: computed(() => `employee-runs:${employeeId.value}`)
});

const assistantLoadingVisible = computed(() => {
  if (!sending.value) {
    return false;
  }
  const assistantId = streamingAssistantId.value;
  if (!assistantId) {
    return true;
  }
  const assistantMessage = messages.value.find((message) => message.id === assistantId);
  if (!assistantMessage) {
    return true;
  }
  return !assistantMessage.content.trim()
    && !(assistantMessage.reasoning?.trim())
    && !(assistantMessage.toolCalls?.length);
});

const displayMessages = computed(() => buildChatDisplayMessages(messages.value));

function syncStickToBottomState() {
  const el = threadEl.value;
  if (!el) {
    return;
  }
  const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
  shouldStickToBottom.value = distanceFromBottom <= 24;
}

function formatAttachmentSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function openUploadPicker() {
  if (sending.value || uploadingFiles.value) {
    return;
  }
  fileInputEl.value?.click();
}

function removePendingUpload(relativePath: string) {
  pendingUploads.value = pendingUploads.value.filter((item) => item.relativePath !== relativePath);
}

function openAttachmentWorkspace(attachment: ChatAttachmentView) {
  void navigateTo({
    path: `/employees/${employeeId.value}/workspace`,
    query: {
      type: "upload",
      path: attachment.relativePath,
      ...(attachment.sourceSessionKey ? { sessionKey: attachment.sourceSessionKey } : {}),
      ...(attachment.sourceMessageId ? { messageId: attachment.sourceMessageId } : {})
    }
  });
}

async function handleFileSelection(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = [...(input.files ?? [])];
  if (files.length === 0) {
    return;
  }
  const formData = new FormData();
  files.forEach((file) => formData.append("files", file));
  uploadingFiles.value = true;
  errorMessage.value = "";
  try {
    const payload = await $fetch<UploadFilesPayload>(`/api/employees/${employeeId.value}/upload-files`, {
      method: "POST",
      body: formData
    });
    const existing = new Set(pendingUploads.value.map((item) => item.relativePath));
    pendingUploads.value = [
      ...pendingUploads.value,
      ...payload.data.items.filter((item) => !existing.has(item.relativePath))
    ];
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error);
  } finally {
    uploadingFiles.value = false;
    input.value = "";
  }
}
function scrollToBottom(force = false) {
  nextTick(() => {
    if (threadEl.value && (force || shouldStickToBottom.value)) {
      threadEl.value.scrollTop = threadEl.value.scrollHeight;
      syncStickToBottomState();
    }
  });
}

function handleThreadScroll() {
  if (restoringHistoryScroll.value) {
    return;
  }
  syncStickToBottomState();
}

function handleSessionListScroll() {
  const el = sessionListEl.value;
  if (!el) {
    return;
  }
  const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
  if (distanceFromBottom <= 48) {
    void loadMoreSessions();
  }
}

function resetStreamingAssistant() {
  streamingAssistantId.value = null;
}

function ensureStreamingAssistantMessage(): ChatMessageView {
  const existing = streamingAssistantId.value
    ? messages.value.find((message) => message.id === streamingAssistantId.value)
    : null;
  if (existing) {
    return existing;
  }
  const nextMessage: ChatMessageView = {
    id: makeLocalId("assistant"),
    role: "assistant",
    content: "",
    timestamp: new Date().toISOString()
  };
  streamingAssistantId.value = nextMessage.id ?? null;
  messages.value = [...messages.value, nextMessage];
  return nextMessage;
}

function replaceMessage(next: ChatMessageView) {
  messages.value = messages.value.map((message) => (message.id === next.id ? next : message));
}

function removeEmptyStreamingAssistantMessage() {
  const assistantId = streamingAssistantId.value;
  if (!assistantId) {
    return;
  }
  const target = messages.value.find((message) => message.id === assistantId);
  if (!target) {
    return;
  }
  const hasVisibleContent = Boolean(target.content.trim())
    || Boolean(target.reasoning?.trim())
    || Boolean(target.toolCalls?.length);
  if (!hasVisibleContent) {
    messages.value = messages.value.filter((message) => message.id !== assistantId);
  }
}

function shouldRenderAssistantMessage(message: ChatMessageView & {
  toolSteps?: Array<unknown>;
  toolResults?: Array<unknown>;
}): boolean {
  const hasVisibleContent = Boolean(message.content.trim())
    || Boolean(message.reasoning?.trim())
    || Boolean(message.toolCalls?.length)
    || Boolean(message.toolSteps?.length)
    || Boolean(message.toolResults?.length)
    || Boolean(message.replyStatus);
  if (hasVisibleContent) {
    return true;
  }
  return !(assistantLoadingVisible.value && message.id === streamingAssistantId.value);
}

function processSummary(msg: { reasoning?: string; toolSteps?: Array<unknown> }): string {
  const segments: string[] = [];
  if (msg.reasoning?.trim()) {
    segments.push("已生成思考过程");
  }
  if ((msg.toolSteps?.length ?? 0) > 0) {
    segments.push(`调用 ${(msg.toolSteps?.length ?? 0)} 个工具步骤`);
  }
  return segments.join(" · ");
}

function getLatestSessionPreviewFallback(fallback: string): string {
  for (let index = messages.value.length - 1; index >= 0; index -= 1) {
    const candidate = messages.value[index];
    if (candidate?.content?.trim()) {
      return candidate.content;
    }
  }
  return fallback;
}

function syncLocalSessionAfterRun(params: {
  sessionKey: string;
  previousSessionKey?: string;
  titleSeed: string;
  messageCountIncrement: number;
}) {
  if (!params.sessionKey) {
    return;
  }
  sessions.value = upsertLocalChatSession({
    sessions: sessions.value,
    sessionKey: params.sessionKey,
    previousSessionKey: params.previousSessionKey,
    latestContent: getLatestSessionPreviewFallback(params.titleSeed),
    occurredAt: new Date().toISOString(),
    titleSeed: params.titleSeed,
    messageCountIncrement: params.messageCountIncrement
  });
}

function mergeSessionPage(existing: ChatSessionListItem[], incoming: ChatSessionListItem[]): ChatSessionListItem[] {
  if (existing.length === 0) {
    return incoming;
  }
  const existingKeys = new Set(existing.map((session) => session.sessionKey));
  return [...existing, ...incoming.filter((session) => !existingKeys.has(session.sessionKey))];
}

async function fetchSessions(options?: { append?: boolean }): Promise<ChatSessionListItem[]> {
  const append = options?.append ?? false;
  if (append && !sessionNextCursor.value) {
    return [];
  }
  if (append) {
    loadingMoreSessions.value = true;
  } else {
    loadingSessions.value = true;
  }
  try {
    const query = new URLSearchParams({ limit: String(SESSION_PAGE_SIZE) });
    if (append && sessionNextCursor.value) {
      query.set("before", sessionNextCursor.value);
    }
    const response = await $fetch<SessionListPayload>(`/api/employees/${employeeId.value}/sessions?${query.toString()}`);
    sessionNextCursor.value = response.data.nextCursor;
    sessions.value = append
      ? mergeSessionPage(sessions.value, response.data.items)
      : response.data.items;
    return response.data.items;
  } finally {
    loadingSessions.value = false;
    loadingMoreSessions.value = false;
  }
}

async function loadMoreSessions() {
  if (loadingSessions.value || loadingMoreSessions.value || !sessionNextCursor.value) {
    return;
  }
  await fetchSessions({ append: true });
}

async function createSession(selectAfterCreate = true): Promise<string> {
  const existingDraft = sessions.value.find((session) => session.isDraft);
  const draft = existingDraft ?? createLocalDraftChatSession(new Date().toISOString());
  if (!existingDraft) {
    sessions.value = [draft, ...sessions.value];
  }
  messages.value = [];
  nextCursor.value = null;
  errorMessage.value = "";
  if (selectAfterCreate) {
    activeSessionKey.value = draft.sessionKey;
  }
  return draft.sessionKey;
}

async function loadMessages(sessionKey: string, before?: string | null) {
  if (!sessionKey || isDraftChatSessionKey(sessionKey)) {
    if (!before) {
      messages.value = [];
      nextCursor.value = null;
    }
    return;
  }
  const previousScrollTop = before ? threadEl.value?.scrollTop ?? 0 : 0;
  const previousScrollHeight = before ? threadEl.value?.scrollHeight ?? 0 : 0;
  if (before) {
    loadingMore.value = true;
  } else {
    loadingMessages.value = true;
  }
  try {
    const query = new URLSearchParams({ limit: "50" });
    if (before) {
      query.set("before", before);
    }
    const response = await $fetch<SessionMessagesPayload>(
      `/api/employees/${employeeId.value}/sessions/${encodeURIComponent(sessionKey)}/messages?${query.toString()}`
    );
    nextCursor.value = response.data.nextCursor;
    messages.value = before
      ? [...response.data.items, ...messages.value]
      : response.data.items;
    if (before) {
      restoringHistoryScroll.value = true;
      await nextTick();
      if (threadEl.value) {
        const scrollDelta = threadEl.value.scrollHeight - previousScrollHeight;
        threadEl.value.scrollTop = previousScrollTop + scrollDelta;
      }
      restoringHistoryScroll.value = false;
      syncStickToBottomState();
    } else {
      scrollToBottom(true);
    }
  } finally {
    loadingMessages.value = false;
    loadingMore.value = false;
  }
}

async function initializeChat() {
  errorMessage.value = "";
  const items = await fetchSessions();
  const initialSelection = resolveInitialChatSelection({
    activeSessionKey: activeSessionKey.value,
    sessions: items
  });
  activeSessionKey.value = initialSelection.sessionKey;
  if (!initialSelection.shouldLoadMessages) {
    messages.value = [];
    nextCursor.value = null;
    return;
  }
  suppressNextSessionLoad.value = true;
  await loadMessages(initialSelection.sessionKey);
}

async function refreshAfterRun() {
  const failedRefreshes = await refreshChatAfterRun({
    refreshEmployee,
    refreshRuns
  });

  if (failedRefreshes.length > 0) {
    console.warn("[employee-chat] post-run partial refresh failed", {
      employeeId: employeeId.value,
      failedRefreshes
    });
    if (!errorMessage.value) {
      errorMessage.value = `消息已发送，但${failedRefreshes.join("、")}刷新失败`;
    }
  }
}

async function loadOlderMessages() {
  if (!activeSessionKey.value || !nextCursor.value || loadingMore.value) {
    return;
  }
  await loadMessages(activeSessionKey.value, nextCursor.value);
}

// eslint-disable-next-line max-lines-per-function
async function sendMessage(input = draft.value) {
  const message = input.trim();
  if (!message || sending.value || uploadingFiles.value) {
    return;
  }
  const attachments = pendingUploads.value.map((item) => ({ ...item }));
  const draftSessionKey = isDraftChatSessionKey(activeSessionKey.value) ? activeSessionKey.value : "";
  const persistedActiveSessionKey = draftSessionKey ? "" : activeSessionKey.value;
  const initialMessageCount = messages.value.length;
  sending.value = true;
  errorMessage.value = "";
  resetStreamingAssistant();
  const optimisticMessage: ChatMessageView = {
    id: makeLocalId("user"),
    role: "user",
    content: message,
    ...(attachments.length > 0 ? { attachments } : {}),
    timestamp: new Date().toISOString()
  };
  messages.value = [...messages.value, optimisticMessage];
  draft.value = "";
  if (textareaEl.value) {
    textareaEl.value.style.height = "auto";
  }

  const controller = new AbortController();
  streamAbortController.value = controller;
  let finalSessionKey = persistedActiveSessionKey;
  let terminalStatus: string | null = null;
  let acceptedByServer = false;

  try {
    const response = await fetch(`/api/employees/${employeeId.value}/chat`, {
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
          activeRunId.value = streamEvent.data.runId;
          finalSessionKey = streamEvent.data.sessionKey;
          acceptedByServer = true;
          break;
        }
        case "thinking": {
          const assistantMessage = ensureStreamingAssistantMessage();
          replaceMessage({
            ...assistantMessage,
            reasoning: mergeProgressText(assistantMessage.reasoning, streamEvent.data.content)
          });
          break;
        }
        case "tool_call": {
          const assistantMessage = ensureStreamingAssistantMessage();
          const toolCalls = assistantMessage.toolCalls ?? [];
          replaceMessage({
            ...assistantMessage,
            toolCalls: [
              ...toolCalls,
              {
                id: streamEvent.data.toolCallId ?? makeLocalId("tool-call"),
                name: streamEvent.data.name,
                arguments: streamEvent.data.args
              }
            ]
          });
          break;
        }
        case "tool_result": {
          messages.value = [
            ...messages.value,
            {
              id: makeLocalId("tool-result"),
              role: "tool",
              content: streamEvent.data.output,
              toolCallId: streamEvent.data.toolCallId,
              toolName: streamEvent.data.name,
              timestamp: new Date().toISOString()
            }
          ];
          break;
        }
        case "reply_delta": {
          const assistantMessage = ensureStreamingAssistantMessage();
          replaceMessage({
            ...assistantMessage,
            content: `${assistantMessage.content}${streamEvent.data.delta}`
          });
          scrollToBottom();
          break;
        }
        case "reply_final": {
          const assistantMessage = ensureStreamingAssistantMessage();
          replaceMessage({
            ...assistantMessage,
            content: streamEvent.data.content
          });
          break;
        }
        case "run_failed": {
          terminalStatus = "failed";
          errorMessage.value = streamEvent.data.message;
          break;
        }
        case "run_aborted": {
          terminalStatus = "aborted";
          errorMessage.value = "本次对话已取消";
          break;
        }
        case "done": {
          terminalStatus = streamEvent.data.status || terminalStatus;
          const assistantMessage = ensureStreamingAssistantMessage();
          replaceMessage({
            ...assistantMessage,
            ...(streamEvent.data.status ? { replyStatus: formatRunStatusMeta(streamEvent.data.status) } : {})
          });
          finalSessionKey = streamEvent.data.sessionKey || finalSessionKey;
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

    if (finalSessionKey && activeSessionKey.value !== finalSessionKey) {
      suppressNextSessionLoad.value = true;
      activeSessionKey.value = finalSessionKey;
    }
    if (acceptedByServer) {
      pendingUploads.value = [];
    }
    removeEmptyStreamingAssistantMessage();
    if (shouldCommitLocalChatSessionUpdate(terminalStatus)) {
      syncLocalSessionAfterRun({
        sessionKey: finalSessionKey,
        previousSessionKey: draftSessionKey || undefined,
        titleSeed: message,
        messageCountIncrement: Math.max(0, messages.value.length - initialMessageCount)
      });
      await refreshAfterRun();
    } else {
      const sessionKeyToReload = finalSessionKey || persistedActiveSessionKey;
      if (sessionKeyToReload) {
        await fetchSessions();
        if (activeSessionKey.value !== sessionKeyToReload) {
          suppressNextSessionLoad.value = true;
          activeSessionKey.value = sessionKeyToReload;
        }
        await loadMessages(sessionKeyToReload);
      } else {
        messages.value = messages.value.filter((item) => item.id !== optimisticMessage.id);
      }
      if (acceptedByServer) {
        pendingUploads.value = [];
      }
    }
  } catch (error) {
    if (controller.signal.aborted) {
      const sessionKeyToRestore = finalSessionKey || persistedActiveSessionKey;
      if (sessionKeyToRestore) {
        await fetchSessions();
        await loadMessages(sessionKeyToRestore);
      } else {
        messages.value = messages.value.filter((item) => item.id !== optimisticMessage.id);
      }
      if (acceptedByServer) {
        pendingUploads.value = [];
      }
      if (!errorMessage.value) {
        errorMessage.value = "本次对话已取消";
      }
    } else {
      errorMessage.value = error instanceof Error ? error.message : String(error);
      const sessionKeyToRestore = finalSessionKey || persistedActiveSessionKey;
      if (sessionKeyToRestore) {
        await fetchSessions();
        await loadMessages(sessionKeyToRestore);
      } else {
        messages.value = messages.value.filter((item) => item.id !== optimisticMessage.id);
      }
      if (acceptedByServer) {
        pendingUploads.value = [];
      }
    }
  } finally {
    removeEmptyStreamingAssistantMessage();
    sending.value = false;
    activeRunId.value = "";
    streamAbortController.value = null;
    resetStreamingAssistant();
  }
}

async function cancelMessage() {
  if (!activeRunId.value) {
    streamAbortController.value?.abort();
    return;
  }
  try {
    const result = await $fetch<{ ok: boolean; data: { stopped: boolean } }>(
      `/api/employees/${employeeId.value}/chat/${activeRunId.value}/cancel`,
      { method: "POST" }
    );
    if (!result.data.stopped) {
      streamAbortController.value?.abort();
    }
  } catch {
    streamAbortController.value?.abort();
  }
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    void sendMessage();
  }
}

function autoResize(e: Event) {
  const el = e.target as HTMLTextAreaElement;
  el.style.height = "auto";
  el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
}

function selectSession(sessionKey: string) {
  if (sending.value || sessionKey === activeSessionKey.value) {
    return;
  }
  activeSessionKey.value = sessionKey;
}

onMounted(() => {
  void initializeChat();
});

watch(() => employeeId.value, () => {
  activeSessionKey.value = "";
  messages.value = [];
  sessions.value = [];
  sessionNextCursor.value = null;
  nextCursor.value = null;
  void initializeChat();
});

watch(activeSessionKey, async (sessionKey, previous) => {
  if (!sessionKey || sessionKey === previous) {
    return;
  }
  if (suppressNextSessionLoad.value) {
    suppressNextSessionLoad.value = false;
    return;
  }
  await loadMessages(sessionKey);
});

watch(messages, () => {
  if (loadingMore.value || restoringHistoryScroll.value) {
    return;
  }
  scrollToBottom();
}, { deep: true });
</script>

<template>
  <div class="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
    <aside class="flex h-[40rem] flex-col rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div class="flex items-center justify-between gap-3">
        <div>
          <span class="section-label">会话</span>
          <h2 class="mt-0.5 text-lg font-semibold">聊天会话</h2>
        </div>
        <button class="btn-secondary rounded-xl px-3" :disabled="sending" @click="createSession()">
          <Plus class="h-3.5 w-3.5" />
          新建
        </button>
      </div>

      <div
        ref="sessionListEl"
        class="mt-4 flex-1 space-y-2 overflow-y-auto pr-1"
        @scroll="handleSessionListScroll"
      >
        <div v-if="loadingSessions" class="flex items-center gap-2 rounded-xl border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
          <Loader2 class="h-4 w-4 animate-spin" />
          正在加载会话…
        </div>

        <button
          v-for="session in sessions"
          :key="session.sessionKey"
          class="w-full rounded-2xl border px-3 py-2.5 text-left transition-colors"
          :class="session.sessionKey === activeSessionKey ? 'border-primary bg-primary/5' : 'border-border bg-background hover:bg-muted/40'"
          :disabled="sending"
          @click="selectSession(session.sessionKey)"
        >
          <div class="flex items-start gap-2">
            <p class="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{{ session.title }}</p>
            <span class="shrink-0 whitespace-nowrap text-[11px] tabular-nums text-muted-foreground">{{ formatTime(session.updatedAt) }}</span>
          </div>
          <p class="mt-1 line-clamp-1 text-xs text-muted-foreground">
            {{ session.preview || "暂无消息" }}
          </p>
          <p class="mt-1.5 text-[10px] text-muted-foreground">{{ session.messageCount }} 条消息</p>
        </button>

        <div
          v-if="!loadingSessions && sessions.length === 0"
          class="rounded-xl border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground"
        >
          还没有对话。输入第一条消息开始，或手动新建会话。
        </div>

        <div v-if="loadingMoreSessions" class="flex items-center justify-center gap-2 py-3 text-xs text-muted-foreground">
          <Loader2 class="h-3.5 w-3.5 animate-spin" />
          正在加载更多会话…
        </div>
      </div>
    </aside>

    <div class="flex flex-col gap-4">
      <!-- <div class="space-y-3">
        <div>
          <span class="section-label">对话</span>
          <h2 class="mt-0.5 text-lg font-semibold">与 {{ employee?.data?.name ?? "员工" }} 对话</h2>
          <p class="text-sm text-muted-foreground">显式会话、多线程切换、流式回复与服务端取消。</p>
        </div>
      </div> -->

      <div
        ref="threadEl"
        @scroll="handleThreadScroll"
        class="flex-1 space-y-4 overflow-y-auto rounded-2xl border border-border bg-muted/15 p-5"
        style="max-height: 32rem; min-height: 20rem;"
      >
        <div v-if="nextCursor" class="flex justify-center">
          <button class="btn-secondary rounded-xl px-4" :disabled="loadingMore" @click="loadOlderMessages">
            <Loader2 v-if="loadingMore" class="h-3.5 w-3.5 animate-spin" />
            <span>{{ loadingMore ? "加载中…" : "加载更早消息" }}</span>
          </button>
        </div>

        <div v-if="loadingMessages" class="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 class="h-4 w-4 animate-spin" />
          正在加载消息…
        </div>

        <template v-for="(msg, i) in displayMessages" :key="msg.key">
          <div v-if="msg.role === 'user'" class="flex items-start justify-end gap-3 animate-fade-in">
            <div class="max-w-[80%] min-w-0 space-y-1">
              <div class="flex items-center justify-end gap-2">
                <span class="text-[11px] text-muted-foreground">{{ formatTime(msg.timestamp) }}</span>
                <span class="text-xs font-semibold text-primary">你</span>
              </div>
              <div class="rounded-2xl rounded-tr-md bg-primary px-4 py-3 text-sm leading-relaxed text-primary-foreground shadow-sm break-words overflow-hidden">
                <div v-html="renderMarkdown(msg.content)" />
              </div>
              <div v-if="msg.attachments?.length" class="flex flex-wrap justify-end gap-2">
                <button
                  v-for="attachment in msg.attachments"
                  :key="attachment.relativePath"
                  class="inline-flex items-center gap-2 rounded-2xl border border-primary-foreground/20 bg-primary-foreground/10 px-3 py-2 text-left text-xs text-primary-foreground/95 transition-colors hover:bg-primary-foreground/20"
                  @click="openAttachmentWorkspace(attachment)"
                >
                  <Paperclip class="h-3.5 w-3.5 shrink-0" />
                  <span class="max-w-[14rem] truncate">{{ attachment.originalName }}</span>
                  <span class="text-primary-foreground/70">{{ formatAttachmentSize(attachment.size) }}</span>
                  <FolderOpen class="h-3.5 w-3.5 shrink-0" />
                </button>
              </div>
            </div>
            <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
              <User class="h-4 w-4 text-primary" :stroke-width="2" />
            </div>
          </div>

          <div v-else-if="msg.role === 'assistant' && shouldRenderAssistantMessage(msg)" class="flex items-start gap-3 animate-fade-in">
            <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-emerald-400/20">
              <Bot class="h-4 w-4 text-primary" :stroke-width="2" />
            </div>
            <div class="max-w-[80%] min-w-0 space-y-1">
              <div class="flex items-center gap-2">
                <span class="text-xs font-semibold text-foreground">{{ employee?.data?.name }}</span>
                <StatusBadge
                  v-if="msg.replyStatus"
                  :label="msg.replyStatus.label"
                  :tone="msg.replyStatus.tone"
                />
                <span class="text-[11px] text-muted-foreground">{{ formatTime(msg.timestamp) }}</span>
              </div>

              <div class="space-y-2 rounded-[22px] border border-border/70 bg-card/70 px-3 py-3 shadow-sm backdrop-blur-sm">
                <div v-if="msg.reasoning || msg.toolSteps?.length" class="rounded-2xl border border-indigo-200/60 bg-gradient-to-b from-indigo-50/60 to-white/80 dark:border-indigo-800/30 dark:from-indigo-950/20 dark:to-slate-950/10">
                  <button
                    class="flex w-full items-center gap-2 px-3 py-2 text-[11px] font-medium text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50/40 dark:hover:bg-indigo-950/20 transition-colors rounded-2xl"
                    @click="toggleProcess(msg.key)"
                  >
                    <Brain class="h-3 w-3" :stroke-width="2" />
                    <span>执行过程</span>
                    <span class="text-[10px] text-indigo-500/90 dark:text-indigo-300/70">{{ processSummary(msg) }}</span>
                    <component :is="expandedProcess.has(msg.key) ? ChevronDown : ChevronRight" class="ml-auto h-3 w-3" />
                  </button>

                  <div v-if="expandedProcess.has(msg.key)" class="px-3 pb-3 space-y-2">
                    <div v-if="msg.reasoning" class="rounded-xl border border-violet-200/60 bg-violet-50/60 px-3 py-2 dark:border-violet-800/30 dark:bg-violet-950/20">
                      <div class="flex items-center gap-1.5 text-[11px] font-medium text-violet-700 dark:text-violet-300">
                        <Brain class="h-3 w-3" :stroke-width="2" />
                        <span>思考过程</span>
                      </div>
                      <div class="mt-1.5 text-xs text-violet-700/80 dark:text-violet-300/70 leading-relaxed whitespace-pre-wrap break-words">{{ msg.reasoning }}</div>
                    </div>

                    <div v-for="toolStep in msg.toolSteps" :key="toolStep.key" class="rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2.5 dark:border-slate-700/40 dark:bg-slate-950/20">
                      <div class="flex items-center gap-1.5 text-[11px] font-semibold text-slate-700 dark:text-slate-200">
                        <Wrench class="h-3 w-3 text-amber-600 dark:text-amber-400" :stroke-width="2" />
                        <span>{{ toolStep.name }}</span>
                      </div>

                      <div v-if="toolStep.call" class="mt-2 rounded-lg border border-amber-200/70 bg-amber-50/60 px-2.5 py-2 dark:border-amber-800/30 dark:bg-amber-950/20">
                        <div class="text-[10px] font-medium uppercase tracking-[0.08em] text-amber-700/80 dark:text-amber-300/70">工具调用</div>
                        <pre class="mt-1 text-[10px] text-amber-800/80 dark:text-amber-300/70 overflow-x-auto whitespace-pre-wrap break-all leading-snug">{{ truncateStr(tryParseJson(toolStep.call.arguments), 500) }}</pre>
                      </div>

                      <div v-if="toolStep.result" class="mt-2 rounded-lg border border-slate-200/80 bg-slate-50/80 px-2.5 py-2 dark:border-slate-700/40 dark:bg-slate-900/50">
                        <div class="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.08em] text-slate-600/90 dark:text-slate-300/80">
                          <Terminal class="h-3 w-3" :stroke-width="2" />
                          <span>工具结果</span>
                        </div>
                        <pre class="mt-1 text-[10px] text-slate-600 dark:text-slate-400 overflow-x-auto whitespace-pre-wrap break-all leading-snug max-h-48 overflow-y-auto">{{ truncateStr(toolStep.result.output, 2000) }}</pre>
                      </div>
                    </div>
                  </div>
                </div>

                <div v-if="msg.content?.trim()" class="chat-bubble-assistant rounded-2xl rounded-tl-md border border-border bg-background px-4 py-3 text-sm leading-relaxed text-foreground shadow-sm overflow-hidden">
                  <div v-html="renderMarkdown(msg.content)" />
                </div>
              </div>
            </div>
          </div>

          <div v-else class="flex justify-center animate-fade-in">
            <div class="flex items-center gap-2 rounded-full border border-warning/20 bg-warning/5 px-4 py-1.5">
              <AlertCircle class="h-3.5 w-3.5 text-warning" :stroke-width="2" />
              <span class="text-xs text-warning-foreground">{{ msg.content }}</span>
            </div>
          </div>
        </template>

        <div v-if="assistantLoadingVisible" class="flex items-start gap-3 animate-fade-in">
          <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-emerald-400/20">
            <Bot class="h-4 w-4 text-primary" :stroke-width="2" />
          </div>
          <div class="max-w-[80%] min-w-0 space-y-1">
            <div class="flex items-center gap-2">
              <span class="text-xs font-semibold text-foreground">{{ employee?.data?.name }}</span>
              <span class="text-[11px] text-muted-foreground">正在回复</span>
            </div>
            <div class="flex items-center gap-2 rounded-2xl rounded-tl-md border border-border bg-card px-4 py-3 text-sm text-muted-foreground shadow-sm">
              <Loader2 class="h-4 w-4 animate-spin" />
              <span>正在生成回复…</span>
            </div>
          </div>
        </div>

        <div
          v-if="messages.length === 0 && !loadingMessages"
          class="flex flex-col items-center justify-center py-16 text-center"
        >
          <div class="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/5">
            <MessageCircle class="h-8 w-8 text-primary/30" :stroke-width="1.5" />
          </div>
          <p class="font-medium text-muted-foreground">开始对话</p>
          <p class="mt-1 max-w-xs text-xs text-muted-foreground">
            在下方输入指令开始对话，或在左侧切换已有会话。
          </p>
        </div>
      </div>

      <div class="rounded-2xl border border-border bg-card p-3.5 shadow-sm transition-all duration-150 focus-within:border-primary/30 focus-within:shadow-md">
        <input
          ref="fileInputEl"
          type="file"
          class="hidden"
          multiple
          accept=".txt,.md,.pdf,.docx,.xlsx,.pptx,.png,.jpg,.jpeg,.gif,.webp"
          @change="handleFileSelection"
        />
        <textarea
          ref="textareaEl"
          v-model="draft"
          rows="2"
          placeholder="输入指令，Shift+Enter 换行…"
          class="w-full resize-none border-0 bg-transparent text-sm leading-relaxed outline-none placeholder:text-muted-foreground"
          :disabled="loadingMessages"
          @keydown="handleKeydown"
          @input="autoResize"
        />
        <div v-if="pendingUploads.length > 0" class="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
          <div
            v-for="attachment in pendingUploads"
            :key="attachment.relativePath"
            class="inline-flex items-center gap-2 rounded-2xl border border-border bg-muted/40 px-3 py-2 text-xs text-foreground"
          >
            <Paperclip class="h-3.5 w-3.5 text-primary" />
            <span class="max-w-[14rem] truncate font-medium">{{ attachment.originalName }}</span>
            <span class="text-muted-foreground">{{ formatAttachmentSize(attachment.size) }}</span>
            <button
              class="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
              :disabled="sending"
              @click="removePendingUpload(attachment.relativePath)"
            >
              <X class="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        <div class="mt-2.5 flex items-center justify-between border-t border-border pt-2.5">
          <div class="flex items-center gap-3 text-[11px] text-muted-foreground">
            <button
              class="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              :disabled="sending || uploadingFiles"
              @click="openUploadPicker"
            >
              <Paperclip class="h-3.5 w-3.5" />
              {{ uploadingFiles ? '上传中…' : '上传文件' }}
            </button>
            <span v-if="pendingUploads.length > 0">待发送 {{ pendingUploads.length }} 个文件</span>
          </div>
          <button
            class="btn-primary rounded-xl px-5"
            :class="sending ? 'bg-destructive hover:bg-destructive/90' : ''"
            :disabled="(!sending && !draft.trim()) || uploadingFiles"
            @click="sending ? cancelMessage() : sendMessage()"
          >
            <StopCircle v-if="sending" class="h-3.5 w-3.5" />
            <Send v-else class="h-3.5 w-3.5" :stroke-width="2" />
            {{ sending ? "取消" : "发送" }}
          </button>
        </div>
      </div>

      <div
        v-if="errorMessage"
        class="flex items-center gap-2 rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive"
      >
        <AlertCircle class="h-4 w-4 shrink-0" :stroke-width="2" />
        <span>{{ errorMessage }}</span>
        <NuxtLink to="/integrations" class="ml-auto shrink-0 font-semibold underline">去配置集成</NuxtLink>
      </div>
    </div>
  </div>
</template>
