<script setup lang="ts">
import {
  type ChatAttachmentView,
  type ChatMessageView,
  type ChatProcessTimelineEntry
} from "~~/shared/ui-models";
import type { UploadFilesPayload } from "~~/shared/api-types";
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { buildChatDisplayMessages } from "~/lib/chat-message-groups";
import { renderMarkdown, formatTime } from "~/lib/utils";
import { useEmployeeChatStore } from "~/composables/useEmployeeChatStore";
import StatusBadge from "~/components/StatusBadge.vue";
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

function sessionCreatorLabel(session: {
  createdByUserDisplayName?: string | null;
  createdByUserId?: string | null;
  isDraft?: boolean;
}): string {
  if (session.isDraft) {
    return "待创建";
  }
  if (session.createdByUserDisplayName?.trim()) {
    return session.createdByUserDisplayName;
  }
  if (session.createdByUserId) {
    return `用户 ${session.createdByUserId.slice(0, 8)}`;
  }
  return "系统";
}

function sessionSourceLabel(session: {
  sourceLabel?: string | null;
  createdByUserId?: string | null;
}): string {
  return session.sourceLabel?.trim() || (session.createdByUserId ? "对话" : "定时任务");
}

function processEntryLabel(entry: ChatProcessTimelineEntry): string {
  switch (entry.kind) {
    case "reasoning":
      return "思考过程";
    case "tool_call":
      return "工具调用";
    case "tool_result":
      return "工具结果";
    case "reply":
      return "过程回复";
  }
}

function processEntryBody(entry: ChatProcessTimelineEntry): string {
  switch (entry.kind) {
    case "reasoning":
    case "reply":
      return normalizeProcessEntryBody(entry.content);
    case "tool_call":
      return normalizeProcessEntryBody(tryParseJson(entry.arguments));
    case "tool_result":
      return normalizeProcessEntryBody(entry.output);
  }
}

function normalizeProcessEntryBody(value: string): string {
  return value
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\n");
}

function processEntryUsesMarkdown(entry: ChatProcessTimelineEntry): boolean {
  if (entry.kind === "tool_call") {
    return false;
  }
  const body = processEntryBody(entry).trim();
  if (!body) {
    return false;
  }
  return /```/.test(body)
    || /(^|\n)#{1,6}\s/.test(body)
    || /(^|\n)\s*[-*+]\s/.test(body)
    || /(^|\n)\s*\d+\.\s/.test(body)
    || /\[[^\]]+\]\([^)]+\)/.test(body)
    || /(^|\n)\s*>\s/.test(body)
    || /\*\*[^*]+\*\*/.test(body)
    || /`[^`]+`/.test(body)
    || /(^|\n)\s*\|.+\|/.test(body);
}

function formatProcessTimestamp(timestamp?: string): string {
  if (!timestamp) {
    return "";
  }
  const normalized = timestamp.includes("T") ? timestamp : timestamp.replace(" ", "T");
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) {
    return timestamp;
  }
  const y = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const h = String(date.getHours()).padStart(2, "0");
  const m = String(date.getMinutes()).padStart(2, "0");
  const s = String(date.getSeconds()).padStart(2, "0");
  return `${y}-${mo}-${d} ${h}:${m}:${s}`;
}

function processEntryUsesCodeBlock(entry: ChatProcessTimelineEntry): boolean {
  return entry.kind === "tool_call" || (entry.kind === "tool_result" && !processEntryUsesMarkdown(entry));
}

function isProcessTimelineExpanded(messageKey: string): boolean {
  return !collapsedProcessTimelineKeys.value.has(messageKey);
}

function toggleProcessTimeline(messageKey: string) {
  const next = new Set(collapsedProcessTimelineKeys.value);
  if (next.has(messageKey)) {
    next.delete(messageKey);
  } else {
    next.add(messageKey);
  }
  collapsedProcessTimelineKeys.value = next;
}

const route = useRoute();
const employeeId = computed(() => String(route.params.id));
const chatStore = useEmployeeChatStore(employeeId);
const draft = ref("");
const collapsedProcessTimelineKeys = ref<Set<string>>(new Set());
const threadEl = ref<HTMLElement | null>(null);
const sessionListEl = ref<HTMLElement | null>(null);
const textareaEl = ref<HTMLTextAreaElement | null>(null);
const fileInputEl = ref<HTMLInputElement | null>(null);
const shouldStickToBottom = ref(true);
const restoringHistoryScroll = ref(false);
const uploadingFiles = ref(false);
const deletingUploadPaths = ref<Set<string>>(new Set());
const uploadDeleteNotice = ref("");
const localErrorMessage = ref("");
let uploadDeleteNoticeTimer: ReturnType<typeof setTimeout> | null = null;
const { data: employee } = useLazyFetch<{
  ok: boolean;
  data: {
    id: string;
    name: string;
    code: string;
  };
}>(() => `/api/employees/${employeeId.value}/identity`);

const chatState = computed(() => chatStore.state.value);
const currentSessionState = computed(() => chatStore.currentSessionState.value);
const sending = computed(() => {
  const runPhase = currentSessionState.value?.runPhase;
  return runPhase === "preparing" || runPhase === "streaming";
});
const loadingSessions = computed(() => chatState.value.loadingSessions);
const loadingMoreSessions = computed(() => chatState.value.loadingMoreSessions);
const loadingMessages = computed(() => currentSessionState.value?.loadStatus === "loading");
const loadingMore = computed(() => currentSessionState.value?.loadingMoreMessages ?? false);
const messages = computed(() => chatStore.displayMessages.value);
const sessions = computed(() => chatState.value.sessions);
const activeSessionKey = computed(() => chatState.value.selectedSessionKey);
const nextCursor = computed(() => currentSessionState.value?.nextCursor ?? null);
const pendingUploads = computed(() => chatState.value.pendingUploads);
const errorMessage = computed(() => localErrorMessage.value || currentSessionState.value?.lastError || "");

const assistantLoadingVisible = computed(() => {
  if (!sending.value) {
    return false;
  }
  const assistantId = currentSessionState.value?.streamingAssistantId;
  if (!assistantId) {
    return true;
  }
  const assistantMessage = messages.value.find((message: ChatMessageView) => message.id === assistantId);
  if (!assistantMessage) {
    return true;
  }
  return !assistantMessage.content.trim()
    && !(assistantMessage.reasoning?.trim())
    && !(assistantMessage.toolCalls?.length)
    && !(assistantMessage.processTimeline?.length);
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

function setUploadDeleteNotice(message: string) {
  uploadDeleteNotice.value = message;
  if (uploadDeleteNoticeTimer) {
    clearTimeout(uploadDeleteNoticeTimer);
  }
  uploadDeleteNoticeTimer = setTimeout(() => {
    uploadDeleteNotice.value = "";
  }, 2500);
}

function openUploadPicker() {
  if (sending.value || uploadingFiles.value) {
    return;
  }
  fileInputEl.value?.click();
}

function isDeletingUpload(relativePath: string): boolean {
  return deletingUploadPaths.value.has(relativePath);
}

async function removePendingUpload(relativePath: string) {
  if (isDeletingUpload(relativePath) || sending.value) {
    return;
  }
  const nextDeleting = new Set(deletingUploadPaths.value);
  nextDeleting.add(relativePath);
  deletingUploadPaths.value = nextDeleting;
  try {
    const result = await $fetch<{ ok: true; data: { deleted: boolean } }>(`/api/employees/${employeeId.value}/upload-files`, {
      method: "DELETE",
      body: { relativePath }
    });
    chatStore.removePendingUpload(relativePath);
    setUploadDeleteNotice(result.data.deleted ? "已删除待发送文件" : "文件不存在，已从待发送列表移除");
  } catch (error) {
    localErrorMessage.value = error instanceof Error ? error.message : String(error);
  } finally {
    const updatedDeleting = new Set(deletingUploadPaths.value);
    updatedDeleting.delete(relativePath);
    deletingUploadPaths.value = updatedDeleting;
  }
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
  localErrorMessage.value = "";
  try {
    const payload = await $fetch<UploadFilesPayload>(`/api/employees/${employeeId.value}/upload-files`, {
      method: "POST",
      body: formData
    });
    chatStore.appendPendingUploads(payload.data.items);
  } catch (error) {
    localErrorMessage.value = error instanceof Error ? error.message : String(error);
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
    void chatStore.loadMoreSessions();
  }
}

function shouldRenderAssistantMessage(message: ChatMessageView & {
  processTimeline?: Array<unknown>;
  toolSteps?: Array<unknown>;
  toolResults?: Array<unknown>;
}): boolean {
  const hasVisibleContent = Boolean(message.content.trim())
    || Boolean(message.reasoning?.trim())
    || Boolean(message.processTimeline?.length)
    || Boolean(message.toolCalls?.length)
    || Boolean(message.toolSteps?.length)
    || Boolean(message.toolResults?.length)
    || Boolean(message.replyStatus);
  if (hasVisibleContent) {
    return true;
  }
  return !(assistantLoadingVisible.value && message.id === currentSessionState.value?.streamingAssistantId);
}


function handleChatVisibilityChange() {
  if (!document.hidden) {
    void chatStore.syncChatWithExternalRuns();
  }
}
async function loadOlderMessages() {
  if (!activeSessionKey.value || !nextCursor.value || loadingMore.value) {
    return;
  }
  const previousScrollTop = threadEl.value?.scrollTop ?? 0;
  const previousScrollHeight = threadEl.value?.scrollHeight ?? 0;
  await chatStore.loadOlderMessages();
  restoringHistoryScroll.value = true;
  await nextTick();
  if (threadEl.value) {
    const scrollDelta = threadEl.value.scrollHeight - previousScrollHeight;
    threadEl.value.scrollTop = previousScrollTop + scrollDelta;
  }
  restoringHistoryScroll.value = false;
  syncStickToBottomState();
}

async function createSession() {
  localErrorMessage.value = "";
  await chatStore.createSession(true);
}

async function sendMessage(input = draft.value) {
  const message = input.trim();
  if (!message || uploadingFiles.value) {
    return;
  }
  localErrorMessage.value = "";
  draft.value = "";
  if (textareaEl.value) {
    textareaEl.value.style.height = "auto";
  }
  await chatStore.sendMessage(message);
}

async function cancelMessage() {
  await chatStore.cancelRun();
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
  localErrorMessage.value = "";
  void chatStore.selectSession(sessionKey);
}

onMounted(() => {
  void chatStore.initializeChat();
  document.addEventListener("visibilitychange", handleChatVisibilityChange);
});

onBeforeUnmount(() => {
  document.removeEventListener("visibilitychange", handleChatVisibilityChange);
  if (uploadDeleteNoticeTimer) {
    clearTimeout(uploadDeleteNoticeTimer);
  }
});

watch(() => employeeId.value, () => {
  localErrorMessage.value = "";
  void chatStore.initializeChat();
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
        <button class="btn-secondary rounded-xl px-3" @click="createSession()">
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
          class="w-full rounded-2xl border px-3 py-3 text-left transition-colors"
          :class="session.sessionKey === activeSessionKey ? 'border-primary bg-primary/5' : 'border-border bg-background hover:bg-muted/40'"
          @click="selectSession(session.sessionKey)"
        >
          <div class="flex items-start gap-2">
            <p class="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{{ session.title }}</p>
            <span class="shrink-0 whitespace-nowrap text-[11px] tabular-nums text-muted-foreground">{{ formatTime(session.updatedAt) }}</span>
          </div>
          <p class="mt-1 line-clamp-1 text-xs text-muted-foreground">
            {{ session.preview || "暂无消息" }}
          </p>
          <div class="mt-2 flex items-center justify-between gap-3">
            <div class="flex min-w-0 flex-wrap items-center gap-1.5">
              <span class="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                <MessageCircle class="h-3 w-3" />
                {{ sessionSourceLabel(session) }}
              </span>
              <span class="inline-flex min-w-0 items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[10px] font-medium text-foreground/85">
                <User class="h-3 w-3 shrink-0" />
                <span class="truncate">{{ sessionCreatorLabel(session) }}</span>
              </span>
            </div>
            <span class="shrink-0 whitespace-nowrap text-[10px] font-medium text-muted-foreground">{{ session.messageCount }} 条消息</span>
          </div>
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
            <div class="flex max-w-[80%] min-w-0 flex-col items-end space-y-1">
              <div class="flex items-center justify-end gap-2">
                <span class="text-[11px] text-muted-foreground">{{ formatTime(msg.timestamp) }}</span>
                <span class="text-xs font-semibold text-primary">你</span>
              </div>
              <div class="inline-block w-fit max-w-full overflow-hidden rounded-2xl rounded-tr-md bg-primary px-4 py-3 text-sm leading-relaxed text-primary-foreground shadow-sm break-words">
                <div v-html="renderMarkdown(msg.content)" />
              </div>
              <div v-if="msg.attachments?.length" class="flex flex-wrap justify-end gap-2">
                <button
                  v-for="attachment in msg.attachments"
                  :key="attachment.relativePath"
                  class="flex w-[18rem] max-w-full items-center gap-2 overflow-hidden rounded-2xl border border-primary/15 bg-card px-3 py-2 text-left text-xs text-foreground shadow-sm transition-colors hover:border-primary/30 hover:bg-primary/5"
                  @click="openAttachmentWorkspace(attachment)"
                >
                  <Paperclip class="h-3.5 w-3.5 shrink-0 text-primary" />
                  <span class="min-w-0 flex-1 truncate">{{ attachment.originalName }}</span>
                  <span class="shrink-0 text-muted-foreground">{{ formatAttachmentSize(attachment.size) }}</span>
                  <FolderOpen class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
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

              <div class="space-y-3 rounded-[22px] border border-border/70 bg-card/70 px-3 py-3 shadow-sm backdrop-blur-sm">
                <div v-if="msg.processTimeline?.length" class="rounded-2xl border border-sky-200/70 bg-gradient-to-b from-sky-50/80 via-white/90 to-slate-50/70">
                  <div class="flex items-center justify-between gap-3 border-b border-sky-200/60 px-3 py-2.5">
                    <div class="flex items-center gap-1.5 text-[11px] font-semibold text-sky-800">
                      <Brain class="h-3.5 w-3.5" :stroke-width="2" />
                      <span>执行时间线</span>
                    </div>
                    <div class="flex items-center gap-2">
                      <span class="text-[10px] tabular-nums text-sky-700/70">{{ msg.processTimeline.length }} 个节点</span>
                      <button
                        class="inline-flex items-center gap-1 rounded-full border border-sky-200/80 bg-white/80 px-2 py-1 text-[10px] font-medium text-sky-700 transition-colors hover:bg-sky-100/80"
                        @click="toggleProcessTimeline(msg.key)"
                      >
                        <component :is="isProcessTimelineExpanded(msg.key) ? ChevronDown : ChevronRight" class="h-3 w-3" :stroke-width="2" />
                        <span>{{ isProcessTimelineExpanded(msg.key) ? '收起' : '展开' }}</span>
                      </button>
                    </div>
                  </div>

                  <div v-if="isProcessTimelineExpanded(msg.key)" class="space-y-3 px-3 py-3">
                    <div
                      v-for="entry in msg.processTimeline"
                      :key="entry.key"
                      class="relative pl-9"
                    >
                      <div class="absolute bottom-[-0.75rem] left-[0.7rem] top-6 w-px bg-border/60" />
                      <div
                        class="absolute left-0 top-0 flex h-6 w-6 items-center justify-center rounded-full border text-[10px]"
                        :class="entry.kind === 'reasoning'
                          ? 'border-violet-200 bg-violet-100 text-violet-700'
                          : entry.kind === 'tool_call'
                            ? 'border-amber-200 bg-amber-100 text-amber-700'
                            : entry.kind === 'tool_result'
                              ? 'border-slate-300 bg-slate-100 text-slate-700'
                              : 'border-emerald-200 bg-emerald-100 text-emerald-700'"
                      >
                        <Brain v-if="entry.kind === 'reasoning'" class="h-3 w-3" :stroke-width="2" />
                        <Wrench v-else-if="entry.kind === 'tool_call'" class="h-3 w-3" :stroke-width="2" />
                        <Terminal v-else-if="entry.kind === 'tool_result'" class="h-3 w-3" :stroke-width="2" />
                        <Bot v-else class="h-3 w-3" :stroke-width="2" />
                      </div>

                      <div class="rounded-2xl border border-border/70 bg-background/90 px-3 py-2.5 shadow-sm">
                        <div class="flex flex-wrap items-center gap-2">
                          <span class="text-[11px] font-semibold text-foreground">{{ processEntryLabel(entry) }}</span>
                          <span v-if="'name' in entry" class="text-[11px] text-muted-foreground">{{ entry.name }}</span>
                          <span v-if="formatProcessTimestamp(entry.timestamp)" class="ml-auto text-[10px] tabular-nums text-muted-foreground">
                            {{ formatProcessTimestamp(entry.timestamp) }}
                          </span>
                        </div>

                        <pre
                          v-if="processEntryUsesCodeBlock(entry)"
                          class="mt-2 max-h-48 overflow-x-auto overflow-y-auto whitespace-pre-wrap break-all rounded-xl border border-border/70 bg-muted/40 px-2.5 py-2 text-[10px] leading-snug text-slate-700"
                        >{{ processEntryBody(entry) }}</pre>
                        <div
                          v-else-if="processEntryUsesMarkdown(entry)"
                          class="timeline-entry-md prose prose-slate mt-2 max-w-none break-words rounded-xl border border-border/70 bg-background px-3 py-2.5 text-xs"
                          v-html="renderMarkdown(processEntryBody(entry))"
                        />
                        <div
                          v-else
                          class="mt-2 whitespace-pre-wrap break-words text-xs leading-relaxed text-foreground/85"
                        >{{ truncateStr(processEntryBody(entry), entry.kind === 'reply' ? 800 : 1200) }}</div>
                      </div>
                    </div>
                  </div>
                </div>

                <div v-if="msg.content?.trim()" class="space-y-1.5">
                  <div v-if="msg.processTimeline?.length" class="px-1 text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                    最终回答
                  </div>
                  <div class="chat-bubble-assistant inline-block w-fit max-w-full overflow-hidden rounded-2xl rounded-tl-md border border-border bg-background px-4 py-3 text-sm leading-relaxed text-foreground shadow-sm">
                    <div v-html="renderMarkdown(msg.content)" />
                  </div>
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
            class="flex w-[18rem] max-w-full items-center gap-2 overflow-hidden rounded-2xl border border-border bg-muted/40 px-3 py-2 text-xs text-foreground"
          >
            <Paperclip class="h-3.5 w-3.5 shrink-0 text-primary" />
            <span class="min-w-0 flex-1 truncate font-medium">{{ attachment.originalName }}</span>
            <span class="shrink-0 text-muted-foreground">{{ formatAttachmentSize(attachment.size) }}</span>
            <button
              class="shrink-0 rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
              :disabled="sending || isDeletingUpload(attachment.relativePath)"
              @click="removePendingUpload(attachment.relativePath)"
            >
              <Loader2 v-if="isDeletingUpload(attachment.relativePath)" class="h-3.5 w-3.5 animate-spin" />
              <X v-else class="h-3.5 w-3.5" />
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
            <span v-if="uploadDeleteNotice" class="text-emerald-600">{{ uploadDeleteNotice }}</span>
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
