<script setup lang="ts">
import { Sparkles, CheckCircle2, AlertCircle, Brain, MessageSquare, ListChecks, X, Plus, Trash2 } from "lucide-vue-next";

type IntegrationItem = {
  id: string;
  title: string;
  statusLabel: string;
  description: string;
  detail: string;
  actionLabel: string;
  tone: "teal" | "amber" | "slate";
};

type IntegrationPayload = { ok: boolean; data: IntegrationItem[] };
type DingTalkConfigPayload = {
  ok: boolean;
  data: {
    enabled: boolean;
    clientId: string;
    clientSecretSet: boolean;
    allowFrom: string[];
  };
};

const { data, refresh } = await useFetch<IntegrationPayload>("/api/integrations");

const integrations = computed(() => data.value?.data ?? []);
const configuredCount = computed(() => integrations.value.filter((i) => i.tone === "teal").length);
const showDingTalkEditor = ref(false);
const editorLoading = ref(false);
const editorSaving = ref(false);
const editorError = ref("");
const allowFromInput = ref("");

const dingtalkForm = reactive({
  enabled: false,
  clientId: "",
  clientSecret: "",
  clientSecretSet: false,
  allowFrom: [] as string[]
});

const toneClasses: Record<string, { border: string; badge: string; iconBg: string }> = {
  teal: { border: "border-primary/20", badge: "bg-primary/10 text-primary", iconBg: "bg-primary/10" },
  amber: { border: "border-amber-200", badge: "bg-amber-50 text-amber-600", iconBg: "bg-amber-50" },
  slate: { border: "border-border", badge: "bg-muted text-muted-foreground", iconBg: "bg-muted" }
};

const iconMap: Record<string, typeof Brain> = {
  "模型提供商": Brain,
  "禅道": ListChecks,
  "钉钉": MessageSquare
};

function resetEditorError() {
  editorError.value = "";
}

function pushAllowFromTag(rawValue: string) {
  const value = rawValue.trim();
  if (!value) {
    return;
  }
  if (dingtalkForm.allowFrom.includes(value)) {
    allowFromInput.value = "";
    return;
  }
  dingtalkForm.allowFrom = [...dingtalkForm.allowFrom, value];
  allowFromInput.value = "";
}

function removeAllowFromTag(value: string) {
  dingtalkForm.allowFrom = dingtalkForm.allowFrom.filter((item) => item !== value);
}

function onAllowFromKeydown(event: KeyboardEvent) {
  if (event.key === "Enter" || event.key === ",") {
    event.preventDefault();
    pushAllowFromTag(allowFromInput.value);
    return;
  }
  if (event.key === "Backspace" && !allowFromInput.value.trim() && dingtalkForm.allowFrom.length > 0) {
    dingtalkForm.allowFrom = dingtalkForm.allowFrom.slice(0, -1);
  }
}

async function openDingTalkEditor() {
  showDingTalkEditor.value = true;
  editorLoading.value = true;
  resetEditorError();
  allowFromInput.value = "";
  dingtalkForm.clientSecret = "";
  try {
    const response = await $fetch<DingTalkConfigPayload>("/api/integrations/dingtalk");
    const payload = response.data;
    dingtalkForm.enabled = payload.enabled;
    dingtalkForm.clientId = payload.clientId;
    dingtalkForm.clientSecret = "";
    dingtalkForm.clientSecretSet = payload.clientSecretSet;
    dingtalkForm.allowFrom = [...payload.allowFrom];
  } catch (error) {
    editorError.value = error instanceof Error ? error.message : String(error);
  } finally {
    editorLoading.value = false;
  }
}

function closeDingTalkEditor() {
  showDingTalkEditor.value = false;
  editorLoading.value = false;
  editorSaving.value = false;
  editorError.value = "";
  allowFromInput.value = "";
  dingtalkForm.clientSecret = "";
}

async function saveDingTalkConfig() {
  editorSaving.value = true;
  resetEditorError();
  try {
    const response = await $fetch<DingTalkConfigPayload>("/api/integrations/dingtalk", {
      method: "PUT",
      body: {
        enabled: dingtalkForm.enabled,
        clientId: dingtalkForm.clientId,
        clientSecret: dingtalkForm.clientSecret,
        allowFrom: dingtalkForm.allowFrom
      }
    });
    dingtalkForm.clientSecret = "";
    dingtalkForm.clientSecretSet = response.data.clientSecretSet;
    await refresh();
    closeDingTalkEditor();
  } catch (error) {
    editorError.value = error instanceof Error ? error.message : String(error);
  } finally {
    editorSaving.value = false;
  }
}

function onCardAction(card: IntegrationItem) {
  if (card.id === "dingtalk") {
    void openDingTalkEditor();
  }
}
</script>

<template>
  <div class="mx-auto max-w-6xl space-y-6 p-6 lg:p-8">
    <div class="hero-section">
      <div class="relative space-y-1">
        <span class="section-label">外部连接</span>
        <h1 class="font-display text-3xl font-bold tracking-tight">集成中心</h1>
        <p class="max-w-2xl text-sm text-muted-foreground">
          配置模型、禅道和钉钉等关键链路，让员工能形成业务闭环。
        </p>
      </div>
    </div>

    <!-- Progress -->
    <div class="flex items-center gap-4">
      <div class="h-2 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          class="h-full rounded-full bg-primary transition-all duration-500"
          :style="{ width: integrations.length ? (configuredCount / integrations.length * 100) + '%' : '0%' }"
        />
      </div>
      <span class="shrink-0 text-sm text-muted-foreground">
        <strong class="text-foreground">{{ configuredCount }}</strong> / {{ integrations.length }} 已配置
      </span>
    </div>

    <!-- Integration Cards -->
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <article
        v-for="card in integrations"
        :key="card.id"
        class="group rounded-xl border bg-card p-5 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5"
        :class="toneClasses[card.tone]?.border"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="flex items-center gap-3">
            <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg" :class="toneClasses[card.tone]?.iconBg">
              <component :is="iconMap[card.title] ?? Sparkles" class="h-5 w-5" :class="card.tone === 'teal' ? 'text-primary' : 'text-muted-foreground'" :stroke-width="1.8" />
            </div>
            <div>
              <h2 class="text-base font-semibold">{{ card.title }}</h2>
            </div>
          </div>
          <span class="shrink-0 flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold" :class="toneClasses[card.tone]?.badge">
            <CheckCircle2 v-if="card.tone === 'teal'" class="h-3 w-3" :stroke-width="2" />
            <AlertCircle v-else class="h-3 w-3" :stroke-width="2" />
            {{ card.statusLabel }}
          </span>
        </div>
        <p class="mt-3 text-sm text-muted-foreground">{{ card.description }}</p>
        <p class="mt-2 rounded-lg bg-muted/30 p-3 text-xs text-muted-foreground font-mono">{{ card.detail }}</p>
        <button class="btn-ghost mt-3 w-full justify-center" :disabled="card.id !== 'dingtalk'" @click="onCardAction(card)">
          {{ card.actionLabel }}
        </button>
      </article>
    </div>

    <div
      v-if="integrations.length === 0"
      class="flex flex-col items-center rounded-2xl border border-dashed border-border bg-muted/10 px-6 py-12 text-center"
    >
      <div class="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/5">
        <Sparkles class="h-7 w-7 text-primary/30" :stroke-width="1.5" />
      </div>
      <p class="font-medium">还没有配置集成</p>
      <p class="mt-1 max-w-xs text-sm text-muted-foreground">集成配置完成后，员工才能调用模型和外部服务。</p>
    </div>

    <Teleport to="body">
      <Transition name="slide-over">
        <div v-if="showDingTalkEditor" class="fixed inset-0 z-50 flex justify-end">
          <div class="absolute inset-0 bg-foreground/20 backdrop-blur-sm" @click="closeDingTalkEditor" />
          <div class="slide-over-panel relative w-full max-w-md overflow-y-auto bg-card shadow-2xl">
            <div class="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card/95 px-6 py-4 backdrop-blur-sm">
              <div>
                <span class="section-label">钉钉集成</span>
                <h2 class="mt-0.5 text-lg font-semibold">编辑连接配置</h2>
              </div>
              <button class="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" @click="closeDingTalkEditor">
                <X class="h-5 w-5" :stroke-width="1.8" />
              </button>
            </div>

            <form class="space-y-4 p-6" @submit.prevent="saveDingTalkConfig">
              <div v-if="editorLoading" class="rounded-lg bg-muted/50 px-3 py-3 text-sm text-muted-foreground">
                正在加载钉钉配置...
              </div>

              <template v-else>
                <label class="flex items-center justify-between rounded-xl bg-muted/40 px-4 py-3">
                  <div>
                    <p class="text-sm font-medium">启用钉钉</p>
                    <p class="text-xs text-muted-foreground">与消息渠道中的 DingTalk 开关保持一致</p>
                  </div>
                  <button
                    type="button"
                    class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors"
                    :class="dingtalkForm.enabled ? 'bg-primary' : 'bg-muted-foreground/30'"
                    @click="dingtalkForm.enabled = !dingtalkForm.enabled"
                  >
                    <span
                      class="inline-block h-5 w-5 transform rounded-full bg-white transition-transform"
                      :class="dingtalkForm.enabled ? 'translate-x-5' : 'translate-x-1'"
                    />
                  </button>
                </label>

                <label class="block space-y-1.5">
                  <span class="text-sm font-medium">Client ID</span>
                  <input v-model="dingtalkForm.clientId" class="input-field" placeholder="请输入 DingTalk Client ID" />
                </label>

                <label class="block space-y-1.5">
                  <span class="text-sm font-medium">Client Secret</span>
                  <input v-model="dingtalkForm.clientSecret" type="password" class="input-field" placeholder="留空保持不变" />
                  <p class="text-[11px] text-muted-foreground">
                    <span v-if="dingtalkForm.clientSecretSet">当前已设置密钥，留空不会覆盖。</span>
                    <span v-else>当前未设置密钥。</span>
                  </p>
                </label>

                <label class="block space-y-1.5">
                  <span class="text-sm font-medium">Allow From</span>
                  <div class="space-y-2 rounded-xl border border-input bg-background px-3 py-2.5">
                    <div v-if="dingtalkForm.allowFrom.length > 0" class="flex flex-wrap gap-2">
                      <span
                        v-for="tag in dingtalkForm.allowFrom"
                        :key="tag"
                        class="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs text-primary"
                      >
                        {{ tag }}
                        <button type="button" class="rounded p-0.5 text-primary/80 hover:bg-primary/15" @click="removeAllowFromTag(tag)">
                          <Trash2 class="h-3 w-3" :stroke-width="2" />
                        </button>
                      </span>
                    </div>
                    <div class="flex items-center gap-2">
                      <input
                        v-model="allowFromInput"
                        class="input-field h-9 border-0 bg-transparent px-0 py-0 focus:ring-0"
                        placeholder="输入后按 Enter 添加"
                        @keydown="onAllowFromKeydown"
                      />
                      <button
                        type="button"
                        class="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                        @click="pushAllowFromTag(allowFromInput)"
                      >
                        <Plus class="h-4 w-4" :stroke-width="2" />
                      </button>
                    </div>
                  </div>
                </label>

                <p v-if="editorError" class="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{{ editorError }}</p>

                <div class="flex items-center justify-between gap-2 border-t border-border pt-4">
                  <button type="button" class="btn-ghost" @click="closeDingTalkEditor">取消</button>
                  <button class="btn-primary" :disabled="editorSaving">
                    {{ editorSaving ? "保存中..." : "保存配置" }}
                  </button>
                </div>
              </template>
            </form>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>
