<script setup lang="ts">
import type { ChatMessageView, ChatResultCardView } from "~~/shared/ui-models";

const route = useRoute();
const employeeId = computed(() => String(route.params.id));
const draft = ref("");
const sending = ref(false);
const lastRunId = ref("");
const errorMessage = ref("");
const resultCards = ref<ChatResultCardView[]>([]);
const messages = ref<ChatMessageView[]>([]);
const { data: employee, refresh: refreshEmployee } = await useEmployeeDetail(employeeId);
const { data: history, refresh: refreshHistory } = await useFetch<{ ok: boolean; data: ChatMessageView[] }>(
  `/api/employees/${employeeId.value}/chat/history`,
  {
    key: computed(() => `employee-chat-history:${employeeId.value}`)
  }
);
const { data: runs, refresh } = await useFetch(`/api/employees/${employeeId.value}/runs`, {
  key: computed(() => `employee-runs:${employeeId.value}`)
});

watchEffect(() => {
  messages.value = history.value?.data ?? [];
});

const starterPrompts = [
  "立即总结今天高风险项目",
  "只看本周延期任务和负责人",
  "模拟一条发给钉钉群的管理摘要"
];

async function sendMessage(input = draft.value) {
  if (!input.trim()) {
    return;
  }
  sending.value = true;
  errorMessage.value = "";
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
    }>(`/api/employees/${employeeId.value}/chat`, {
      method: "POST",
      body: {
        message: input
      }
    });
    resultCards.value = result.data.resultCards;
    lastRunId.value = result.data.runId;
    messages.value = result.data.messages;
    draft.value = "";
    await Promise.all([refresh(), refreshEmployee(), refreshHistory()]);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error);
  } finally {
    sending.value = false;
  }
}

const quickActions = computed(() => [
  { label: "复制摘要", disabled: resultCards.value.length === 0, action: async () => navigator.clipboard.writeText(resultCards.value[0]?.content ?? "") },
  { label: "查看运行详情", disabled: !lastRunId.value, to: `/runs?runId=${lastRunId.value}` }
]);
</script>

<template>
  <div class="chat-workbench">
    <section class="chat-main stack-card">
      <div class="chat-intro">
        <div>
          <p class="eyebrow">Chat Workbench</p>
          <h2>直接给 {{ employee?.data?.name ?? "员工" }} 下达任务</h2>
          <p class="muted">这里统一展示消息流、结构化结果和下一步动作，不再把聊天和执行结果拆成两块。</p>
        </div>
        <div class="tag-list">
          <button
            v-for="prompt in starterPrompts"
            :key="prompt"
            type="button"
            class="tag-button"
            @click="sendMessage(prompt)"
          >
            {{ prompt }}
          </button>
        </div>
      </div>

      <div class="message-thread">
        <article v-for="(message, index) in messages" :key="`${message.role}-${index}-${message.timestamp ?? 'na'}`" class="message-card" :data-role="message.role">
          <div class="message-card-header">
            <strong>{{ message.role === "user" ? "你" : message.role === "assistant" ? employee?.data?.name : "系统" }}</strong>
            <span>{{ message.timestamp ?? "刚刚" }}</span>
          </div>
          <p>{{ message.content }}</p>
        </article>
        <EmptyState
          v-if="messages.length === 0"
          title="还没有会话历史"
          description="发送第一条指令后，这里会保留最近的对话和结果。"
        />
      </div>

      <div class="chat-composer">
        <label>
          对员工说什么
          <textarea v-model="draft" rows="6" placeholder="例如：请按项目维度和成员维度总结今天的风险情况，并给出建议动作。" />
        </label>
        <div class="form-actions">
          <span class="muted">优先用清晰的目标、范围和输出要求来提问。</span>
          <button class="primary-button" :disabled="sending" @click="sendMessage()">
            {{ sending ? "正在执行..." : "发送指令" }}
          </button>
        </div>
      </div>

      <p v-if="errorMessage" class="error-banner">
        {{ errorMessage }}
        <NuxtLink class="inline-link" to="/integrations">去配置模型或业务集成</NuxtLink>
      </p>
    </section>

    <aside class="chat-side">
      <article class="stack-card">
        <div class="section-header">
          <div>
            <p class="eyebrow">Structured Result</p>
            <h2>本次结果卡片</h2>
          </div>
          <NuxtLink v-if="lastRunId" class="ghost-link" :to="`/runs?runId=${lastRunId}`">运行详情</NuxtLink>
        </div>
        <div class="result-card-stack">
          <ResultCard v-for="card in resultCards" :key="`${card.kind}-${card.title}`" :card="card" />
          <EmptyState
            v-if="resultCards.length === 0"
            title="等待结果产出"
            description="员工执行后，摘要、项目维度、成员维度和建议动作会自动整理成卡片。"
          />
        </div>
      </article>

      <article class="stack-card">
        <p class="eyebrow">Quick Actions</p>
        <h2>下一步动作</h2>
        <div class="action-list">
          <button class="ghost-link button-reset" :disabled="quickActions[0]?.disabled" @click="quickActions[0]?.action">
            {{ quickActions[0]?.label }}
          </button>
          <NuxtLink v-if="!quickActions[1]?.disabled" class="ghost-link" :to="quickActions[1]?.to ?? '/runs'">{{ quickActions[1]?.label }}</NuxtLink>
          <NuxtLink class="ghost-link" to="/integrations">检查集成配置</NuxtLink>
        </div>
      </article>

      <article class="stack-card">
        <p class="eyebrow">Recent Runs</p>
        <h2>最近执行</h2>
        <div class="mini-feed">
          <NuxtLink v-for="run in runs?.data ?? []" :key="run.id" class="mini-feed-row" :to="`/runs?runId=${run.id}`">
            <strong>{{ run.status }}</strong>
            <span>{{ run.summary || run.startedAt }}</span>
          </NuxtLink>
        </div>
      </article>
    </aside>
  </div>
</template>
