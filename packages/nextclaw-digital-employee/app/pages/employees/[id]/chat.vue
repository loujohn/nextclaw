<script setup lang="ts">
import type { ChatMessageView, ChatResultCardView } from "~~/shared/ui-models";
import { Send, Copy, ExternalLink, Settings, Sparkles, Loader2, User, Bot, AlertCircle, MessageCircle } from "lucide-vue-next";

const route = useRoute();
const employeeId = computed(() => String(route.params.id));
const draft = ref("");
const sending = ref(false);
const lastRunId = ref("");
const errorMessage = ref("");
const resultCards = ref<ChatResultCardView[]>([]);
const messages = ref<ChatMessageView[]>([]);
const threadEl = ref<HTMLElement | null>(null);
const textareaEl = ref<HTMLTextAreaElement | null>(null);
const copied = ref(false);
const { data: employee, refresh: refreshEmployee } = await useEmployeeDetail(employeeId);
const { data: history, refresh: refreshHistory } = await useFetch<{ ok: boolean; data: ChatMessageView[] }>(
  `/api/employees/${employeeId.value}/chat/history`,
  { key: computed(() => `employee-chat-history:${employeeId.value}`) }
);
const { refresh } = await useFetch(`/api/employees/${employeeId.value}/runs`, {
  key: computed(() => `employee-runs:${employeeId.value}`)
});

watchEffect(() => {
  messages.value = (history.value?.data ?? []).filter(m => m.content?.trim());
});

watch(messages, () => {
  nextTick(() => {
    if (threadEl.value) {
      threadEl.value.scrollTop = threadEl.value.scrollHeight;
    }
  });
});

const starterPrompts = [
  { text: "立即总结今天高风险项目", icon: "📊" },
  { text: "只看本周延期任务和负责人", icon: "⏰" },
  { text: "模拟一条发给钉钉群的管理摘要", icon: "📝" }
];

function renderMarkdown(raw: string): string {
  let html = raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_m, lang, code) => {
    const langLabel = lang ? `<span class="code-lang">${lang}</span>` : "";
    return `<div class="code-block">${langLabel}<pre><code>${code.trim()}</code></pre></div>`;
  });

  html = html.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/^[-•]\s+(.+)$/gm, '<li class="md-li">$1</li>');
  html = html.replace(/((?:<li class="md-li">.*<\/li>\n?)+)/g, '<ul class="md-ul">$1</ul>');
  html = html.replace(/\n/g, "<br>");

  return html;
}

async function sendMessage(input = draft.value) {
  if (!input.trim()) return;
  sending.value = true;
  errorMessage.value = "";
  messages.value = [...messages.value, { role: "user", content: input }];
  draft.value = "";
  if (textareaEl.value) textareaEl.value.style.height = "auto";
  try {
    const result = await $fetch<{
      ok: boolean;
      data: {
        reply: string;
        runId: string;
        sessionKey: string;
        messages: ChatMessageView[];
        resultCards: ChatResultCardView[];
        runSummary: string;
      };
    }>(`/api/employees/${employeeId.value}/chat`, { method: "POST", body: { message: input } });
    resultCards.value = result.data.resultCards;
    lastRunId.value = result.data.runId;
    messages.value = result.data.messages.filter(m => m.content?.trim());
    await Promise.all([refresh(), refreshEmployee(), refreshHistory()]);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error);
    messages.value = messages.value.filter(m => !(m.role === "user" && m.content === input));
  } finally {
    sending.value = false;
  }
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

async function copyToClipboard(text: string) {
  await navigator.clipboard.writeText(text);
  copied.value = true;
  setTimeout(() => { copied.value = false; }, 2000);
}
</script>

<template>
  <div class="grid gap-6 lg:grid-cols-[1fr_320px]">
    <!-- Chat Main -->
    <div class="flex flex-col gap-4">
      <!-- Intro -->
      <div class="space-y-3">
        <div>
          <span class="section-label">对话</span>
          <h2 class="mt-0.5 text-lg font-semibold">与 {{ employee?.data?.name ?? "员工" }} 对话</h2>
          <p class="text-sm text-muted-foreground">发送指令、查看结果和执行下一步动作。</p>
        </div>
        <div v-if="messages.length === 0" class="flex flex-wrap gap-2">
          <button
            v-for="prompt in starterPrompts"
            :key="prompt.text"
            type="button"
            class="group flex items-center gap-2 rounded-xl border border-border bg-card px-3.5 py-2 text-xs font-medium transition-all duration-150 hover:border-primary/30 hover:bg-primary/5 hover:text-primary hover:shadow-sm"
            @click="sendMessage(prompt.text)"
          >
            <span class="text-sm">{{ prompt.icon }}</span>
            {{ prompt.text }}
          </button>
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
            <div class="max-w-[80%] space-y-1">
              <div class="flex items-center justify-end gap-2">
                <span class="text-[11px] text-muted-foreground">{{ msg.timestamp ?? "刚刚" }}</span>
                <span class="text-xs font-semibold text-primary">你</span>
              </div>
              <div class="rounded-2xl rounded-tr-md bg-primary px-4 py-3 text-sm leading-relaxed text-primary-foreground shadow-sm">
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
            <div class="max-w-[80%] space-y-1">
              <div class="flex items-center gap-2">
                <span class="text-xs font-semibold text-foreground">{{ employee?.data?.name }}</span>
                <span class="text-[11px] text-muted-foreground">{{ msg.timestamp ?? "刚刚" }}</span>
              </div>
              <div class="chat-bubble-assistant rounded-2xl rounded-tl-md border border-border bg-card px-4 py-3 text-sm leading-relaxed text-foreground shadow-sm">
                <div v-html="renderMarkdown(msg.content)" />
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
            在下方输入指令开始对话，或点击上方的快捷提示快速开始。
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
            :disabled="sending || !draft.trim()"
            @click="sendMessage()"
          >
            <Loader2 v-if="sending" class="h-3.5 w-3.5 animate-spin" />
            <Send v-else class="h-3.5 w-3.5" :stroke-width="2" />
            {{ sending ? "执行中" : "发送" }}
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

    <!-- Right Sidebar -->
    <aside class="space-y-4">
      <!-- Result Cards -->
      <div class="rounded-xl border border-border bg-card p-4 shadow-sm">
        <div class="mb-3 flex items-center justify-between">
          <div>
            <span class="section-label">结果</span>
            <h3 class="mt-0.5 text-sm font-semibold">本次结果卡片</h3>
          </div>
          <NuxtLink v-if="lastRunId" :to="`/runs?runId=${lastRunId}`" class="text-xs text-muted-foreground transition-colors hover:text-foreground">
            详情 →
          </NuxtLink>
        </div>
        <div class="space-y-3">
          <ResultCard v-for="card in resultCards" :key="`${card.kind}-${card.title}`" :card="card" />
          <div
            v-if="resultCards.length === 0"
            class="flex flex-col items-center py-8 text-center"
          >
            <div class="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/5">
              <Sparkles class="h-5 w-5 text-primary/30" :stroke-width="1.5" />
            </div>
            <p class="text-sm font-medium text-muted-foreground">等待结果产出</p>
            <p class="mt-0.5 text-xs text-muted-foreground">执行后会自动整理为卡片。</p>
          </div>
        </div>
      </div>

      <!-- Quick Actions -->
      <div class="rounded-xl border border-border bg-card p-4 shadow-sm">
        <span class="section-label mb-3 block">快捷操作</span>
        <div class="space-y-2">
          <button
            class="flex w-full items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm transition-all duration-150 hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-40"
            :disabled="resultCards.length === 0"
            @click="resultCards[0] && copyToClipboard(resultCards[0].content ?? '')"
          >
            <Copy class="h-3.5 w-3.5" :stroke-width="1.8" />
            {{ copied ? "已复制" : "复制摘要" }}
          </button>
          <NuxtLink
            v-if="lastRunId"
            :to="`/runs?runId=${lastRunId}`"
            class="flex w-full items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm transition-all duration-150 hover:bg-muted/50"
          >
            <ExternalLink class="h-3.5 w-3.5" :stroke-width="1.8" />
            查看运行详情
          </NuxtLink>
          <NuxtLink
            to="/integrations"
            class="flex w-full items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm transition-all duration-150 hover:bg-muted/50"
          >
            <Settings class="h-3.5 w-3.5" :stroke-width="1.8" />
            检查集成配置
          </NuxtLink>
        </div>
      </div>

    </aside>
  </div>
</template>
