<script setup lang="ts">
import { Sparkles, CheckCircle2, AlertCircle, Brain, MessageSquare, ListChecks, X, BookOpen, GitBranch } from "lucide-vue-next";
import {
  applyDingTalkAccountRenames,
  buildDingTalkAccountGroupOverrides,
  buildEditableDingTalkGroupBindings,
  createEmptyDingTalkGroupBinding,
  type EditableDingTalkGroupBinding
} from "~~/shared/dingtalk-editor-model";

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
type EmployeeListPayload = {
  ok: boolean;
  data: Array<{ id: string; name: string; code: string }>;
};

type DingTalkAccountView = {
  accountId: string;
  clientId: string;
  clientSecretSet: boolean;
  robotCode: string;
  corpId: string;
  agentId: string;
  allowFrom: string[];
  dmPolicy: string;
  groupPolicy: string;
  groupAllowFrom: string[];
  requireMention: boolean;
  mentionPatterns: string[];
  groups: Record<string, { requireMention: boolean; mentionPatterns: string[] }>;
};

type DingTalkConfigPayload = {
  ok: boolean;
  data: {
    channel: {
      enabled: boolean;
      defaultAccountId: string;
      accounts: DingTalkAccountView[];
    };
    routing: {
      defaultByAccount: Record<string, string>;
      groups: Array<{
        groupId: string;
        employeeCode: string;
        accountId: string;
        allowCollaboration: boolean;
        allowedEmployeeCodes: string[];
      }>;
    };
  };
};

type EditableAccount = DingTalkAccountView & {
  sourceAccountId: string;
  clientSecret: string;
};

const { data, refresh } = useLazyFetch<IntegrationPayload>("/api/integrations");
const employeeData = ref<EmployeeListPayload | null>(null);

const integrations = computed(() => data.value?.data ?? []);
const employees = computed(() => employeeData.value?.data ?? []);
const staticCardTotal = 2;
const staticCardConfigured = 2;
const totalCardCount = computed(() => integrations.value.length + staticCardTotal);
const configuredCount = computed(() => integrations.value.filter((i) => i.tone === "teal").length + staticCardConfigured);
const showDingTalkEditor = ref(false);
const editorLoading = ref(false);
const editorSaving = ref(false);
const editorError = ref("");

const dingtalkForm = reactive({
  enabled: false,
  defaultAccountId: "default",
  accounts: [] as EditableAccount[],
  deletedAccountIds: [] as string[],
  defaultByAccount: {} as Record<string, string>,
  groups: [] as EditableDingTalkGroupBinding[]
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

function createEmptyAccount(): EditableAccount {
  const suffix = String(Date.now()).slice(-5);
  return {
    sourceAccountId: "",
    accountId: `account-${suffix}`,
    clientId: "",
    clientSecret: "",
    clientSecretSet: false,
    robotCode: "",
    corpId: "",
    agentId: "",
    allowFrom: [],
    dmPolicy: "open",
    groupPolicy: "open",
    groupAllowFrom: [],
    requireMention: false,
    mentionPatterns: [],
    groups: {}
  };
}

function createEmptyGroupBinding(): EditableDingTalkGroupBinding {
  return createEmptyDingTalkGroupBinding(dingtalkForm.defaultAccountId);
}

function openEditorWithPayload(payload: DingTalkConfigPayload["data"]) {
  dingtalkForm.enabled = payload.channel.enabled;
  dingtalkForm.defaultAccountId = payload.channel.defaultAccountId;
  dingtalkForm.deletedAccountIds = [];
  dingtalkForm.defaultByAccount = { ...payload.routing.defaultByAccount };
  dingtalkForm.accounts = payload.channel.accounts.map((account) => ({
    ...account,
    sourceAccountId: account.accountId,
    clientSecret: ""
  }));
  dingtalkForm.groups = buildEditableDingTalkGroupBindings({
    accounts: payload.channel.accounts,
    routingGroups: payload.routing.groups
  });
  if (!dingtalkForm.defaultAccountId && dingtalkForm.accounts[0]) {
    dingtalkForm.defaultAccountId = dingtalkForm.accounts[0].accountId;
  }
}

async function openDingTalkEditor() {
  showDingTalkEditor.value = true;
  editorLoading.value = true;
  resetEditorError();
  try {
    const [response, empResponse] = await Promise.all([
      $fetch<DingTalkConfigPayload>("/api/integrations/dingtalk"),
      employeeData.value ? Promise.resolve(employeeData.value) : $fetch<EmployeeListPayload>("/api/employees"),
    ]);
    employeeData.value = empResponse;
    openEditorWithPayload(response.data);
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
}

function addAccount() {
  dingtalkForm.accounts = [...dingtalkForm.accounts, createEmptyAccount()];
  if (!dingtalkForm.defaultAccountId) {
    dingtalkForm.defaultAccountId = dingtalkForm.accounts[dingtalkForm.accounts.length - 1]?.accountId ?? "default";
  }
}

function removeAccount(index: number) {
  const account = dingtalkForm.accounts[index];
  if (!account) {
    return;
  }
  if (account.sourceAccountId) {
    dingtalkForm.deletedAccountIds.push(account.sourceAccountId);
  }
  dingtalkForm.accounts = dingtalkForm.accounts.filter((_, currentIndex) => currentIndex !== index);
  if (dingtalkForm.defaultAccountId === account.accountId) {
    dingtalkForm.defaultAccountId = dingtalkForm.accounts[0]?.accountId ?? "default";
  }
  dingtalkForm.groups = dingtalkForm.groups.filter((group) => group.accountId !== account.accountId);
  if (dingtalkForm.defaultByAccount[account.accountId]) {
    delete dingtalkForm.defaultByAccount[account.accountId];
  }
}

function addGroupBinding() {
  dingtalkForm.groups = [...dingtalkForm.groups, createEmptyGroupBinding()];
}

function removeGroupBinding(index: number) {
  dingtalkForm.groups = dingtalkForm.groups.filter((_, currentIndex) => currentIndex !== index);
}

function normalizeCsv(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

async function saveDingTalkConfig() {
  editorSaving.value = true;
  resetEditorError();
  try {
    const activeAccounts = dingtalkForm.accounts
      .map((account) => ({
        ...account,
        accountId: account.accountId.trim(),
        sourceAccountId: account.sourceAccountId.trim()
      }))
      .filter((account) => account.accountId);

    const renamedSourceIds = activeAccounts
      .filter((account) => account.sourceAccountId && account.sourceAccountId !== account.accountId)
      .map((account) => account.sourceAccountId);

    const remappedRouting = applyDingTalkAccountRenames({
      accounts: activeAccounts,
      defaultByAccount: dingtalkForm.defaultByAccount,
      groups: dingtalkForm.groups
    });
    const renamedDefaultAccountId =
      activeAccounts.find(
        (account) => account.sourceAccountId === dingtalkForm.defaultAccountId && account.accountId !== account.sourceAccountId
      )?.accountId ?? dingtalkForm.defaultAccountId;
    const allowedAccountIds = new Set(activeAccounts.map((account) => account.accountId));
    const accountGroupOverrides = buildDingTalkAccountGroupOverrides({
      accounts: activeAccounts,
      groups: remappedRouting.groups
    });
    const routingDefaultByAccount = Object.fromEntries(
      Object.entries(remappedRouting.defaultByAccount).filter(([accountId]) => allowedAccountIds.has(accountId))
    );
    const routingGroups = remappedRouting.groups
      .map((group) => ({
        groupId: group.groupId.trim(),
        accountId: group.accountId.trim(),
        employeeCode: group.employeeCode.trim(),
        allowCollaboration: group.allowCollaboration,
        allowedEmployeeCodes: normalizeCsv(group.allowedEmployeeCodesText)
      }))
      .filter((group) => group.groupId && group.accountId && group.employeeCode && allowedAccountIds.has(group.accountId))
      .map((group) => ({
        groupId: group.groupId,
        employeeCode: group.employeeCode,
        accountId: group.accountId,
        allowCollaboration: group.allowCollaboration,
        allowedEmployeeCodes: group.allowedEmployeeCodes
      }));

    await $fetch<DingTalkConfigPayload>("/api/integrations/dingtalk", {
      method: "PUT",
      body: {
        channel: {
          enabled: dingtalkForm.enabled,
          defaultAccountId: renamedDefaultAccountId,
          removeAccountIds: [...new Set([...dingtalkForm.deletedAccountIds, ...renamedSourceIds])],
          upserts: activeAccounts.map((account) => ({
            sourceAccountId: account.sourceAccountId,
            accountId: account.accountId,
            clientId: account.clientId,
            clientSecret: account.clientSecret,
            robotCode: account.robotCode,
            corpId: account.corpId,
            agentId: account.agentId,
            allowFrom: account.allowFrom,
            dmPolicy: account.dmPolicy,
            groupPolicy: account.groupPolicy,
            groupAllowFrom: account.groupAllowFrom,
            requireMention: account.requireMention,
            mentionPatterns: account.mentionPatterns,
            groups: accountGroupOverrides[account.accountId] ?? {}
          }))
        },
        routing: {
          defaultByAccount: routingDefaultByAccount,
          groups: routingGroups
        }
      }
    });

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
          配置模型、业务系统和钉钉入口，让员工可以进私聊、进群，并为后续协作保留清晰路由。
        </p>
      </div>
    </div>

    <div class="flex items-center gap-4">
      <div class="h-2 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          class="h-full rounded-full bg-primary transition-all duration-500"
          :style="{ width: totalCardCount ? (configuredCount / totalCardCount * 100) + '%' : '0%' }"
        />
      </div>
      <span class="shrink-0 text-sm text-muted-foreground">
        <strong class="text-foreground">{{ configuredCount }}</strong> / {{ totalCardCount }} 已配置
      </span>
    </div>

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

      <article
        class="group rounded-xl border bg-card p-5 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5"
        :class="toneClasses['teal']?.border"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="flex items-center gap-3">
            <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg" :class="toneClasses['teal']?.iconBg">
              <BookOpen class="h-5 w-5 text-primary" :stroke-width="1.8" />
            </div>
            <div>
              <h2 class="text-base font-semibold">政务公司知识库</h2>
            </div>
          </div>
          <span class="shrink-0 flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold" :class="toneClasses['teal']?.badge">
            <CheckCircle2 class="h-3 w-3" :stroke-width="2" />
            已接入
          </span>
        </div>
        <p class="mt-3 text-sm text-muted-foreground">政务公司知识库已可用于员工检索政策文件、业务规范和企业文档，提升问答与决策质量。</p>
        <p class="mt-2 rounded-lg bg-muted/30 p-3 text-xs text-muted-foreground font-mono">政务知识库 v2 · 最近同步 2026-03-26 08:00</p>
        <button class="btn-ghost mt-3 w-full justify-center" disabled>查看配置</button>
      </article>

      <article
        class="group rounded-xl border bg-card p-5 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5"
        :class="toneClasses['teal']?.border"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="flex items-center gap-3">
            <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg" :class="toneClasses['teal']?.iconBg">
              <GitBranch class="h-5 w-5 text-primary" :stroke-width="1.8" />
            </div>
            <div>
              <h2 class="text-base font-semibold">代码仓库</h2>
            </div>
          </div>
          <span class="shrink-0 flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold" :class="toneClasses['teal']?.badge">
            <CheckCircle2 class="h-3 w-3" :stroke-width="2" />
            已接入
          </span>
        </div>
        <p class="mt-3 text-sm text-muted-foreground">代码仓库已接入，员工可读取代码上下文、触发 CI/CD 流程并协助完成代码评审工作。</p>
        <p class="mt-2 rounded-lg bg-muted/30 p-3 text-xs text-muted-foreground font-mono">GitLab · main 分支 · 最近检查 2026-03-26 08:00</p>
        <button class="btn-ghost mt-3 w-full justify-center" disabled>查看配置</button>
      </article>
    </div>

    <Teleport to="body">
      <Transition name="slide-over">
        <div v-if="showDingTalkEditor" class="fixed inset-0 z-50 flex justify-end">
          <div class="absolute inset-0 bg-foreground/20 backdrop-blur-sm" @click="closeDingTalkEditor" />
          <div class="slide-over-panel relative w-full max-w-3xl overflow-y-auto bg-card shadow-2xl">
            <div class="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card/95 px-6 py-4 backdrop-blur-sm">
              <div>
                <span class="section-label">钉钉入口</span>
                <h2 class="mt-0.5 text-lg font-semibold">多机器人与群路由</h2>
              </div>
              <button class="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" @click="closeDingTalkEditor">
                <X class="h-5 w-5" :stroke-width="1.8" />
              </button>
            </div>

            <IntegrationsDingTalkEditorForm
              :form="dingtalkForm"
              :employees="employees"
              :loading="editorLoading"
              :saving="editorSaving"
              :error="editorError"
              @save="saveDingTalkConfig"
              @close="closeDingTalkEditor"
              @add-account="addAccount"
              @remove-account="removeAccount"
              @add-group="addGroupBinding"
              @remove-group="removeGroupBinding"
            />
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>
