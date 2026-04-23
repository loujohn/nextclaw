<script setup lang="ts">
import { Bot, Webhook, Copy, Check, ShieldCheck, RotateCw, Save } from "lucide-vue-next";

const route = useRoute();
const employeeId = computed(() => String(route.params.id));

const { data: dingtalkConfig, refresh: refreshDingTalkConfig } = useLazyFetch<{
  ok: boolean;
  data: {
    channel: {
      enabled: boolean;
      defaultAccountId: string;
      accounts: Array<{ accountId: string }>;
    };
  };
}>("/api/integrations/dingtalk");

const { data: dingtalkBinding, refresh: refreshDingTalkBinding } = useLazyFetch<{
  ok: boolean;
  data: {
    employeeCode: string;
    directAccountIds: string[];
    groupBindings: Array<{
      groupId: string;
      accountId: string;
      allowCollaboration: boolean;
      allowedEmployeeCodes: string[];
    }>;
  };
}>(() => `/api/employees/${employeeId.value}/dingtalk-binding`);

const dingtalkForm = reactive({
  directAccountIds: [] as string[]
});

watchEffect(() => {
  dingtalkForm.directAccountIds = [...(dingtalkBinding.value?.data.directAccountIds ?? [])];
});

async function saveDingTalkBinding() {
  await $fetch(`/api/employees/${employeeId.value}/dingtalk-binding`, {
    method: "PUT",
    body: {
      directAccountIds: dingtalkForm.directAccountIds,
      groupBindings: dingtalkBinding.value?.data.groupBindings ?? []
    }
  });
  await Promise.all([refreshDingTalkBinding(), refreshDingTalkConfig()]);
}

const configTab = ref<"dingtalk" | "workspace" | "webhook">("dingtalk");

// ── Webhook ──────────────────────────────────────────────────────────────────
const { data: employeeDetail, refresh: refreshEmployeeWebhook } = useLazyFetch<{
  ok: boolean;
  data: {
    id: string;
    code: string;
    webhookEnabled: boolean;
    webhookSecret: string | null;
  };
}>(() => `/api/employees/${employeeId.value}/webhook`);

const webhookEnabled = ref(false);
const webhookSecret = ref("");
const webhookSaving = ref(false);
const webhookSaved = ref(false);
const webhookCopied = ref(false);

watchEffect(() => {
  if (employeeDetail.value?.data) {
    webhookEnabled.value = employeeDetail.value.data.webhookEnabled;
    webhookSecret.value = employeeDetail.value.data.webhookSecret ?? "";
  }
});

const webhookUrl = computed(() => {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const code = employeeDetail.value?.data?.code ?? "";
  const base = `${origin}/api/webhooks/e/${code}`;
  if (webhookSecret.value) {
    return `${base}?token=${encodeURIComponent(webhookSecret.value)}`;
  }
  return base;
});

function generateSecret() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  for (const byte of arr) {
    result += chars[byte % chars.length];
  }
  webhookSecret.value = result;
}

async function saveWebhook() {
  webhookSaving.value = true;
  webhookSaved.value = false;
  try {
    await $fetch(`/api/employees/${employeeId.value}`, {
      method: "PATCH",
      body: {
        webhookEnabled: webhookEnabled.value,
        webhookSecret: webhookSecret.value || null,
      },
    });
    await refreshEmployeeWebhook();
    webhookSaved.value = true;
    setTimeout(() => { webhookSaved.value = false; }, 2500);
  } finally {
    webhookSaving.value = false;
  }
}

async function copyWebhookUrl() {
  try {
    await navigator.clipboard.writeText(webhookUrl.value);
    webhookCopied.value = true;
    setTimeout(() => { webhookCopied.value = false; }, 2000);
  } catch {
    /* clipboard API unavailable in insecure context */
  }
}
</script>

<template>
  <div class="space-y-4">
    <nav class="flex gap-2">
      <button
        class="rounded-full px-4 py-2 text-sm font-medium transition-colors"
        :class="configTab === 'dingtalk' ? 'bg-primary text-primary-foreground' : 'border border-border bg-card text-muted-foreground hover:text-foreground'"
        @click="configTab = 'dingtalk'"
      >钉钉入口</button>
      <button
        class="rounded-full px-4 py-2 text-sm font-medium transition-colors"
        :class="configTab === 'workspace' ? 'bg-primary text-primary-foreground' : 'border border-border bg-card text-muted-foreground hover:text-foreground'"
        @click="configTab = 'workspace'"
      >工作空间</button>
      <button
        class="rounded-full px-4 py-2 text-sm font-medium transition-colors"
        :class="configTab === 'webhook' ? 'bg-primary text-primary-foreground' : 'border border-border bg-card text-muted-foreground hover:text-foreground'"
        @click="configTab = 'webhook'"
      >Webhook</button>
    </nav>

    <template v-if="configTab === 'dingtalk'">
      <section v-if="dingtalkConfig?.data && dingtalkBinding?.data" class="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div class="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <span class="section-label">钉钉入口</span>
            <h2 class="mt-0.5 text-base font-semibold">私聊绑定与群入口</h2>
          </div>
          <span
            class="rounded-full px-3 py-1 text-xs font-semibold"
            :class="dingtalkConfig.data.channel.enabled ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'"
          >
            {{ dingtalkConfig.data.channel.enabled ? "已启用" : "未启用" }}
          </span>
        </div>

        <div class="grid gap-5 p-5 lg:grid-cols-[320px_1fr]">
          <form class="space-y-3 rounded-xl border border-border bg-muted/30 p-4" @submit.prevent="saveDingTalkBinding">
            <div class="flex items-center gap-2 text-sm font-medium">
              <Bot class="h-4 w-4" :stroke-width="1.8" />
              默认私聊入口
            </div>
            <p class="text-xs text-muted-foreground">可同时勾选多个账号；这些机器人私聊都会默认交给该员工。</p>

            <div class="space-y-2 rounded-lg border border-border bg-background/80 p-3">
              <label
                v-for="account in dingtalkConfig.data.channel.accounts"
                :key="account.accountId"
                class="flex cursor-pointer items-center gap-2 text-sm"
              >
                <input v-model="dingtalkForm.directAccountIds" type="checkbox" :value="account.accountId" class="h-4 w-4 rounded accent-primary" />
                <span>{{ account.accountId }}</span>
              </label>
              <p v-if="dingtalkConfig.data.channel.accounts.length === 0" class="text-xs text-muted-foreground">
                还没有可用账号，请先在集成中心配置钉钉机器人。
              </p>
            </div>

            <button class="btn-primary" type="submit">保存钉钉绑定</button>
          </form>

          <div class="space-y-3 rounded-xl border border-border bg-muted/30 p-4">
            <div>
              <span class="section-label">已接管群</span>
              <h3 class="mt-0.5 text-sm font-semibold">当前群入口状态</h3>
            </div>

            <div v-if="dingtalkBinding.data.groupBindings.length === 0" class="rounded-lg bg-background/80 px-4 py-3 text-sm text-muted-foreground">
              当前还没有群绑定到这个员工。可在集成中心的"群路由"里指定。
            </div>

            <div
              v-for="group in dingtalkBinding.data.groupBindings"
              :key="group.groupId"
              class="rounded-lg border border-border bg-background/80 p-3"
            >
              <div class="flex items-center justify-between gap-3">
                <div>
                  <p class="text-sm font-semibold">{{ group.groupId }}</p>
                  <p class="text-xs text-muted-foreground">入口账号：{{ group.accountId }}</p>
                </div>
                <span
                  class="rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
                  :class="group.allowCollaboration ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'"
                >
                  {{ group.allowCollaboration ? "允许后台协作" : "单员工直出" }}
                </span>
              </div>
              <p class="mt-1.5 text-xs text-muted-foreground">
                协作者：{{ group.allowedEmployeeCodes.length > 0 ? group.allowedEmployeeCodes.join("、") : "未配置" }}
              </p>
            </div>
          </div>
        </div>
      </section>

      <div v-else class="rounded-xl border border-border bg-card px-6 py-10 text-center text-sm text-muted-foreground shadow-sm">
        钉钉渠道未配置，请先在集成中心启用钉钉机器人。
      </div>
    </template>

    <!-- ── Webhook 配置 ──────────────────────────────────────────────── -->
    <template v-if="configTab === 'webhook'">
      <section class="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div class="flex items-center justify-between px-5 py-4 border-b border-border">
          <div class="flex items-center gap-3">
            <Webhook class="h-5 w-5 text-primary" />
            <div>
              <span class="section-label">外部触发</span>
              <h2 class="mt-0.5 text-base font-semibold">Webhook 配置</h2>
            </div>
          </div>
          <label class="relative inline-flex items-center cursor-pointer">
            <input v-model="webhookEnabled" type="checkbox" class="sr-only peer" />
            <div class="w-11 h-6 bg-muted rounded-full peer peer-checked:bg-primary transition-colors after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full" />
          </label>
        </div>
        <div class="p-5 space-y-5">
          <p class="text-sm text-muted-foreground leading-relaxed">
            启用后，外部系统（如 GitLab、GitHub 等）可通过 Webhook URL 向该员工发送事件，员工将根据已安装的技能自动处理请求。
          </p>

          <!-- Webhook URL -->
          <div class="space-y-2">
            <label class="text-sm font-medium text-foreground">Webhook URL</label>
            <div class="flex items-center gap-2">
              <div class="flex-1 flex items-center rounded-lg border border-border bg-muted/30 px-3 py-2.5 font-mono text-xs text-foreground select-all overflow-x-auto">
                {{ webhookUrl }}
              </div>
              <button
                class="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2.5 text-xs font-medium transition-colors"
                :class="webhookCopied ? 'text-primary bg-primary/5' : 'text-muted-foreground hover:text-foreground hover:bg-secondary'"
                @click="copyWebhookUrl"
              >
                <component :is="webhookCopied ? Check : Copy" class="h-3.5 w-3.5" />
                {{ webhookCopied ? "已复制" : "复制" }}
              </button>
            </div>
          </div>

          <!-- Webhook Secret -->
          <div class="space-y-2">
            <label class="text-sm font-medium text-foreground flex items-center gap-1.5">
              <ShieldCheck class="h-4 w-4 text-muted-foreground" />
              鉴权密钥
              <span class="text-xs text-muted-foreground font-normal">（可选）</span>
            </label>
            <div class="flex items-center gap-2">
              <input
                v-model="webhookSecret"
                type="text"
                placeholder="留空则不校验鉴权"
                class="flex-1 rounded-lg border border-input bg-background px-3 py-2.5 font-mono text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <button
                class="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                title="生成随机密钥"
                @click="generateSecret"
              >
                <RotateCw class="h-3.5 w-3.5" />
                生成
              </button>
            </div>
            <p class="text-[11px] text-muted-foreground leading-relaxed">
              配置密钥后，请求需携带 <code class="font-mono bg-muted px-1 py-0.5 rounded">?token=密钥</code> 或请求头 <code class="font-mono bg-muted px-1 py-0.5 rounded">x-webhook-secret: 密钥</code>。
            </p>
          </div>

          <!-- Save Button -->
          <div class="flex items-center gap-3 pt-2">
            <button
              class="flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
              :class="webhookSaved
                ? 'bg-primary/80 text-primary-foreground'
                : 'bg-primary text-primary-foreground hover:bg-primary/90'"
              :disabled="webhookSaving"
              @click="saveWebhook"
            >
              <component :is="webhookSaved ? Check : Save" class="h-3.5 w-3.5" />
              {{ webhookSaving ? "保存中…" : webhookSaved ? "已保存" : "保存" }}
            </button>
          </div>
        </div>
      </section>
    </template>

    <EmployeeWorkspacePanel v-if="configTab === 'workspace'" :employee-id="employeeId" />
  </div>
</template>
