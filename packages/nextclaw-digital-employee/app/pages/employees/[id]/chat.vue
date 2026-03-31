<script setup lang="ts">
import type { ChatMessageView } from "~~/shared/ui-models";
import { renderMarkdown, formatTime } from "~/lib/utils";
import { Send, User, Bot, AlertCircle, MessageCircle, StopCircle, Wrench, Brain, ChevronDown, ChevronRight, Terminal } from "lucide-vue-next";

const expandedToolCalls = ref<Set<number>>(new Set());
const expandedReasoning = ref<Set<number>>(new Set());
const expandedToolResults = ref<Set<number>>(new Set());

function toggleToolCalls(index: number) {
  const s = new Set(expandedToolCalls.value);
  s.has(index) ? s.delete(index) : s.add(index);
  expandedToolCalls.value = s;
}
function toggleReasoning(index: number) {
  const s = new Set(expandedReasoning.value);
  s.has(index) ? s.delete(index) : s.add(index);
  expandedReasoning.value = s;
}
function toggleToolResult(index: number) {
  const s = new Set(expandedToolResults.value);
  s.has(index) ? s.delete(index) : s.add(index);
  expandedToolResults.value = s;
}
function tryParseJson(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch { return raw; }
}
function truncateStr(s: string, max = 200): string {
  return s.length > max ? s.slice(0, max) + "…" : s;
}

const route = useRoute();
const employeeId = computed(() => String(route.params.id));
const draft = ref("");
const sending = ref(false);
const errorMessage = ref("");
const messages = ref<ChatMessageView[]>([]);
const threadEl = ref<HTMLElement | null>(null);
const textareaEl = ref<HTMLTextAreaElement | null>(null);
const abortController = ref<AbortController | null>(null);
const { data: employee, refresh: refreshEmployee } = await useEmployeeDetail(employeeId);
const { data: history, refresh: refreshHistory } = await useFetch<{
  ok: boolean;
  data: {
    messages: ChatMessageView[];
  };
}>(
  `/api/employees/${employeeId.value}/chat/history`,
  { key: computed(() => `employee-chat-history:${employeeId.value}`) }
);
const { refresh } = await useFetch(`/api/employees/${employeeId.value}/runs`, {
  key: computed(() => `employee-runs:${employeeId.value}`)
});

watchEffect(() => {
  const historyData = history.value?.data;
  messages.value = (historyData?.messages ?? []).filter(m => m.content?.trim() || m.toolCalls?.length || m.role === "tool");
});

function scrollToBottom() {
  nextTick(() => {
    if (threadEl.value) {
      threadEl.value.scrollTop = threadEl.value.scrollHeight;
    }
  });
}

onMounted(() => {
  scrollToBottom();
});

watch(messages, () => {
  scrollToBottom();
});

async function sendMessage(input = draft.value) {
  if (!input.trim()) return;
  sending.value = true;
  errorMessage.value = "";
  abortController.value = new AbortController();
  const optimisticMsg: ChatMessageView = { role: "user", content: input, timestamp: new Date().toISOString() };
  messages.value = [...messages.value, optimisticMsg];
  draft.value = "";
  if (textareaEl.value) textareaEl.value.style.height = "auto";
  try {
    const result = await $fetch<{
      ok: boolean;
      data: {
        reply: string;
        messages: ChatMessageView[];
      };
    }>(`/api/employees/${employeeId.value}/chat`, {
      method: "POST",
      body: { message: input },
      signal: abortController.value.signal,
    });
    messages.value = result.data.messages.filter(m => m.content?.trim() || m.toolCalls?.length || m.role === "tool");
    await Promise.all([refresh(), refreshEmployee(), refreshHistory()]);
  } catch (error) {
    const e = error as Error & { cause?: Error };
    const isAbort =
      e?.name === "AbortError" ||
      e?.cause?.name === "AbortError" ||
      (typeof e?.message === "string" && e.message.toLowerCase().includes("aborted"));
    messages.value = messages.value.filter(m => m !== optimisticMsg);
    if (isAbort) {
      draft.value = input;
    } else {
      errorMessage.value = e instanceof Error ? e.message : String(e);
    }
  } finally {
    sending.value = false;
    abortController.value = null;
  }
}

function cancelMessage() {
  abortController.value?.abort();
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
}

function autoResize(e: Event) {
  const el = e.target as HTMLTextAreaElement;
  el.style.height = "auto";
  el.style.height = Math.min(el.scrollHeight, 180) + "px";
}

</script>

<template>
  <div class="flex flex-col gap-4">
      <!-- Intro -->
      <div class="space-y-3">
        <div>
          <span class="section-label">对话</span>
          <h2 class="mt-0.5 text-lg font-semibold">与 {{ employee?.data?.name ?? "员工" }} 对话</h2>
          <p class="text-sm text-muted-foreground">发送指令并持续对话。</p>
        </div>

      </div>

      <!-- Message Thread -->
      <div
        ref="threadEl"
        class="flex-1 space-y-4 overflow-y-auto rounded-2xl border border-border bg-muted/15 p-5"
        style="max-height: 560px; min-height: 320px;"
      >
        <template v-for="(msg, i) in messages" :key="`${msg.role}-${i}-${msg.timestamp ?? 'na'}`">
          <!-- User Message -->
          <div v-if="msg.role === 'user'" class="flex items-start justify-end gap-3 animate-fade-in">
            <div class="max-w-[80%] min-w-0 space-y-1">
              <div class="flex items-center justify-end gap-2">
                <span class="text-[11px] text-muted-foreground">{{ formatTime(msg.timestamp) }}</span>
                <span class="text-xs font-semibold text-primary">你</span>
              </div>
              <div class="rounded-2xl rounded-tr-md bg-primary px-4 py-3 text-sm leading-relaxed text-primary-foreground shadow-sm break-words overflow-hidden">
                <div v-html="renderMarkdown(msg.content)" />
              </div>
            </div>
            <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
              <User class="h-4 w-4 text-primary" :stroke-width="2" />
            </div>
          </div>

          <!-- Assistant Message -->
          <div v-else-if="msg.role === 'assistant'" class="flex items-start gap-3 animate-fade-in">
            <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-emerald-400/20">
              <Bot class="h-4 w-4 text-primary" :stroke-width="2" />
            </div>
            <div class="max-w-[80%] min-w-0 space-y-1">
              <div class="flex items-center gap-2">
                <span class="text-xs font-semibold text-foreground">{{ employee?.data?.name }}</span>
                <span class="text-[11px] text-muted-foreground">{{ formatTime(msg.timestamp) }}</span>
              </div>

              <!-- 推理过程（可折叠） -->
              <div v-if="msg.reasoning" class="rounded-xl border border-violet-200/50 bg-violet-50/30 dark:border-violet-800/30 dark:bg-violet-950/20">
                <button
                  class="flex w-full items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium text-violet-600 dark:text-violet-400 hover:bg-violet-50/50 dark:hover:bg-violet-950/30 transition-colors rounded-xl"
                  @click="toggleReasoning(i)"
                >
                  <Brain class="h-3 w-3" :stroke-width="2" />
                  <span>思考过程</span>
                  <component :is="expandedReasoning.has(i) ? ChevronDown : ChevronRight" class="ml-auto h-3 w-3" />
                </button>
                <div v-if="expandedReasoning.has(i)" class="px-3 pb-2 text-xs text-violet-700/80 dark:text-violet-300/70 leading-relaxed whitespace-pre-wrap break-words">{{ msg.reasoning }}</div>
              </div>

              <!-- 工具调用（可折叠） -->
              <div v-if="msg.toolCalls?.length" class="rounded-xl border border-amber-200/50 bg-amber-50/30 dark:border-amber-800/30 dark:bg-amber-950/20">
                <button
                  class="flex w-full items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium text-amber-700 dark:text-amber-400 hover:bg-amber-50/50 dark:hover:bg-amber-950/30 transition-colors rounded-xl"
                  @click="toggleToolCalls(i)"
                >
                  <Wrench class="h-3 w-3" :stroke-width="2" />
                  <span>调用了 {{ msg.toolCalls.length }} 个工具</span>
                  <component :is="expandedToolCalls.has(i) ? ChevronDown : ChevronRight" class="ml-auto h-3 w-3" />
                </button>
                <div v-if="expandedToolCalls.has(i)" class="px-3 pb-2 space-y-1.5">
                  <div v-for="tc in msg.toolCalls" :key="tc.id" class="rounded-lg bg-amber-100/40 dark:bg-amber-900/20 px-2.5 py-1.5">
                    <div class="text-[11px] font-mono font-semibold text-amber-800 dark:text-amber-300">{{ tc.name }}</div>
                    <pre class="mt-0.5 text-[10px] text-amber-700/70 dark:text-amber-400/60 overflow-x-auto whitespace-pre-wrap break-all leading-snug">{{ truncateStr(tryParseJson(tc.arguments), 500) }}</pre>
                  </div>
                </div>
              </div>

              <!-- 正文 -->
              <div v-if="msg.content?.trim()" class="chat-bubble-assistant rounded-2xl rounded-tl-md border border-border bg-card px-4 py-3 text-sm leading-relaxed text-foreground shadow-sm overflow-hidden">
                <div v-html="renderMarkdown(msg.content)" />
              </div>
            </div>
          </div>

          <!-- Tool Result Message -->
          <div v-else-if="msg.role === 'tool'" class="flex items-start gap-3 animate-fade-in pl-11">
            <div class="max-w-[80%] min-w-0">
              <div class="rounded-xl border border-slate-200/50 bg-slate-50/50 dark:border-slate-700/30 dark:bg-slate-900/30">
                <button
                  class="flex w-full items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400 hover:bg-slate-100/50 dark:hover:bg-slate-800/30 transition-colors rounded-xl"
                  @click="toggleToolResult(i)"
                >
                  <Terminal class="h-3 w-3" :stroke-width="2" />
                  <span>{{ msg.toolName || '工具结果' }}</span>
                  <component :is="expandedToolResults.has(i) ? ChevronDown : ChevronRight" class="ml-auto h-3 w-3" />
                </button>
                <div v-if="expandedToolResults.has(i)" class="px-3 pb-2">
                  <pre class="text-[10px] text-slate-600 dark:text-slate-400 overflow-x-auto whitespace-pre-wrap break-all leading-snug max-h-48 overflow-y-auto">{{ truncateStr(msg.content, 2000) }}</pre>
                </div>
              </div>
            </div>
          </div>

          <!-- System Message -->
          <div v-else class="flex justify-center animate-fade-in">
            <div class="flex items-center gap-2 rounded-full border border-warning/20 bg-warning/5 px-4 py-1.5">
              <AlertCircle class="h-3.5 w-3.5 text-warning" :stroke-width="2" />
              <span class="text-xs text-warning-foreground">{{ msg.content }}</span>
            </div>
          </div>
        </template>

        <!-- Typing Indicator -->
        <div v-if="sending" class="flex items-start gap-3 animate-fade-in">
          <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-emerald-400/20">
            <Bot class="h-4 w-4 text-primary" :stroke-width="2" />
          </div>
          <div class="space-y-1">
            <span class="text-xs font-semibold text-foreground">{{ employee?.data?.name }}</span>
            <div class="flex items-center gap-2 rounded-2xl rounded-tl-md border border-border bg-card px-4 py-3 shadow-sm">
              <span class="typing-dots flex gap-1">
                <span class="h-1.5 w-1.5 rounded-full bg-primary/50" />
                <span class="h-1.5 w-1.5 rounded-full bg-primary/50" />
                <span class="h-1.5 w-1.5 rounded-full bg-primary/50" />
              </span>
              <span class="text-sm text-muted-foreground">正在思考...</span>
            </div>
          </div>
        </div>

        <!-- Empty State -->
        <div
          v-if="messages.length === 0 && !sending"
          class="flex flex-col items-center justify-center py-16 text-center"
        >
          <div class="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/5">
            <MessageCircle class="h-8 w-8 text-primary/30" :stroke-width="1.5" />
          </div>
          <p class="font-medium text-muted-foreground">开始对话</p>
          <p class="mt-1 max-w-xs text-xs text-muted-foreground">
            在下方输入指令开始对话。
          </p>
        </div>
      </div>

      <!-- Composer -->
      <div class="rounded-2xl border border-border bg-card p-4 shadow-sm transition-all duration-150 focus-within:border-primary/30 focus-within:shadow-md">
        <textarea
          ref="textareaEl"
          v-model="draft"
          rows="2"
          placeholder="输入指令，Shift+Enter 换行…"
          class="w-full resize-none border-0 bg-transparent text-sm leading-relaxed outline-none placeholder:text-muted-foreground"
          @keydown="handleKeydown"
          @input="autoResize"
        />
        <div class="mt-3 flex items-center justify-between border-t border-border pt-3">
          <p class="text-[11px] text-muted-foreground">Enter 发送 · Shift+Enter 换行</p>
          <button
            class="btn-primary rounded-xl px-5"
            :class="sending ? 'bg-destructive hover:bg-destructive/90' : ''"
            :disabled="!sending && !draft.trim()"
            @click="sending ? cancelMessage() : sendMessage()"
          >
            <StopCircle v-if="sending" class="h-3.5 w-3.5" />
            <Send v-else class="h-3.5 w-3.5" :stroke-width="2" />
            {{ sending ? "终止" : "发送" }}
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
</template>
