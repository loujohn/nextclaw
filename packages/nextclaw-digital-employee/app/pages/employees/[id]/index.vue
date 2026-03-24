<script setup lang="ts">
import { formatScheduleSummary, formatRunStatusLabel, formatDateTime, translateRunText } from "~~/shared/ui-models";
import { MessageSquare, Bot } from "lucide-vue-next";

const route = useRoute();
const employeeId = computed(() => String(route.params.id));
const { data, refresh } = await useEmployeeDetail(employeeId);
const { data: dingtalkConfig, refresh: refreshDingTalkConfig } = await useFetch<{
  ok: boolean;
  data: {
    channel: {
      enabled: boolean;
      defaultAccountId: string;
      accounts: Array<{ accountId: string }>;
    };
  };
}>("/api/integrations/dingtalk");
const { data: dingtalkBinding, refresh: refreshDingTalkBinding } = await useFetch<{
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

const scheduleForm = reactive({
  scheduleKind: "cron",
  cronExpr: "0 18 * * *",
  everyMs: 1800000
});

const dingtalkForm = reactive({
  directAccountIds: [] as string[]
});

watchEffect(() => {
  const schedule = data.value?.data.schedule;
  if (!schedule) return;
  scheduleForm.scheduleKind = (schedule.scheduleKind as "cron" | "every" | "heartbeat") ?? "cron";
  scheduleForm.cronExpr = schedule.cronExpr ?? "0 18 * * *";
  scheduleForm.everyMs = schedule.everyMs ?? 1800000;
});

watchEffect(() => {
  dingtalkForm.directAccountIds = [...(dingtalkBinding.value?.data.directAccountIds ?? [])];
});

async function saveSchedule() {
  await $fetch(`/api/employees/${employeeId.value}/schedule`, {
    method: "PATCH",
    body: scheduleForm
  });
  await refresh();
}

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
</script>

<template>
  <div class="space-y-5" v-if="data?.data">
    <!-- Role Brief -->
    <section class="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div class="mb-4 flex items-center justify-between">
        <div>
          <span class="section-label">角色定义</span>
          <h2 class="mt-0.5 text-lg font-semibold">职责与人设</h2>
        </div>
        <NuxtLink :to="`/employees/${employeeId}/chat`" class="btn-primary">
          <MessageSquare class="h-3.5 w-3.5" :stroke-width="1.8" />
          进入聊天
        </NuxtLink>
      </div>
      <p class="text-sm leading-relaxed text-muted-foreground">{{ data.data.description || "未填写职责说明" }}</p>
      <pre class="mt-3 rounded-lg bg-muted/50 p-4 font-mono text-xs leading-relaxed text-foreground whitespace-pre-wrap">{{ data.data.systemPrompt || "尚未配置系统提示词" }}</pre>
    </section>

    <div v-if="false" class="grid gap-5 lg:grid-cols-2">
      <!-- Automation -->
      <section class="rounded-xl border border-border bg-card p-5 shadow-sm">
        <span class="section-label">自动化</span>
        <h2 class="mt-0.5 mb-3 text-lg font-semibold">自动任务</h2>
        <p class="mb-4 text-sm text-muted-foreground">{{ formatScheduleSummary(data.data.schedule) }}</p>

        <form class="space-y-3" @submit.prevent="saveSchedule">
          <label class="block space-y-1.5">
            <span class="text-sm font-medium">运行方式</span>
            <select v-model="scheduleForm.scheduleKind" class="input-field">
              <option value="cron">每日/定时</option>
              <option value="every">固定间隔</option>
              <option value="heartbeat">心跳巡检</option>
            </select>
          </label>
          <label v-if="scheduleForm.scheduleKind === 'cron'" class="block space-y-1.5">
            <span class="text-sm font-medium">Cron 表达式</span>
            <input v-model="scheduleForm.cronExpr" class="input-field font-mono" />
          </label>
          <label v-else class="block space-y-1.5">
            <span class="text-sm font-medium">间隔毫秒</span>
            <input v-model.number="scheduleForm.everyMs" type="number" min="1000" class="input-field" />
          </label>
          <button class="btn-primary">
            保存自动任务
          </button>
        </form>
      </section>

      <!-- Latest Output -->
      <section class="rounded-xl border border-border bg-card p-5 shadow-sm">
        <span class="section-label">产出</span>
        <h2 class="mt-0.5 mb-3 text-lg font-semibold">最近结果</h2>
        <div class="space-y-2">
          <NuxtLink
            v-for="run in data.data.recentRuns.slice(0, 4)"
            :key="run.id"
            :to="`/runs?runId=${run.id}`"
            class="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2.5 text-sm transition-colors hover:bg-muted/50"
          >
            <span class="shrink-0 whitespace-nowrap font-medium">{{ formatRunStatusLabel(run.status) }}</span>
            <span class="min-w-0 truncate text-xs text-muted-foreground">{{ translateRunText(run.summary) || formatDateTime(run.startedAt) }}</span>
          </NuxtLink>
          <p v-if="data.data.recentRuns.length === 0" class="text-sm text-muted-foreground">
            还没有最近结果，可以先进入聊天页手动触发一次。
          </p>
        </div>
      </section>
    </div>

    <section class="rounded-xl border border-border bg-card p-5 shadow-sm" v-if="dingtalkConfig?.data && dingtalkBinding?.data">
      <div class="mb-4 flex items-center justify-between">
        <div>
          <span class="section-label">钉钉入口</span>
          <h2 class="mt-0.5 text-lg font-semibold">私聊绑定与群入口概览</h2>
        </div>
        <div class="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
          {{ dingtalkConfig.data.channel.enabled ? "已启用" : "未启用" }}
        </div>
      </div>

      <div class="grid gap-5 lg:grid-cols-[320px_1fr]">
        <form class="space-y-3 rounded-xl border border-border bg-muted/10 p-4" @submit.prevent="saveDingTalkBinding">
          <div class="flex items-center gap-2 text-sm font-medium">
            <Bot class="h-4 w-4" :stroke-width="1.8" />
            默认私聊入口
          </div>
          <label class="block space-y-1.5">
            <span class="text-sm text-muted-foreground">可同时勾选多个账号；这些机器人私聊都会默认交给该员工。</span>
            <div class="space-y-2 rounded-lg border border-border bg-background/80 p-3">
              <label v-for="account in dingtalkConfig.data.channel.accounts" :key="account.accountId" class="flex items-center gap-2 text-sm">
                <input v-model="dingtalkForm.directAccountIds" type="checkbox" :value="account.accountId" />
                <span>{{ account.accountId }}</span>
              </label>
              <p v-if="dingtalkConfig.data.channel.accounts.length === 0" class="text-xs text-muted-foreground">
                还没有可用账号，请先在集成中心配置钉钉机器人。
              </p>
            </div>
          </label>
          <button class="btn-primary">
            保存钉钉绑定
          </button>
        </form>

        <div class="space-y-3 rounded-xl border border-border bg-muted/10 p-4">
          <div>
            <span class="section-label">已接管群</span>
            <h3 class="mt-0.5 text-base font-semibold">当前群入口状态</h3>
          </div>

          <div v-if="dingtalkBinding.data.groupBindings.length === 0" class="rounded-lg bg-background/80 px-4 py-4 text-sm text-muted-foreground">
            当前还没有群直接绑定到这个员工。可在集成中心的“群路由”里指定某些群由该员工作为对外入口。
          </div>

          <div v-for="group in dingtalkBinding.data.groupBindings" :key="group.groupId" class="rounded-lg border border-border bg-background/80 p-4">
            <div class="flex items-center justify-between gap-3">
              <div>
                <p class="text-sm font-semibold">{{ group.groupId }}</p>
                <p class="text-xs text-muted-foreground">入口账号：{{ group.accountId }}</p>
              </div>
              <span class="rounded-full px-2.5 py-0.5 text-[11px] font-semibold" :class="group.allowCollaboration ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'">
                {{ group.allowCollaboration ? "允许后台协作" : "单员工直出" }}
              </span>
            </div>
            <p class="mt-2 text-xs text-muted-foreground">
              协作者：{{ group.allowedEmployeeCodes.length > 0 ? group.allowedEmployeeCodes.join("、") : "未配置" }}
            </p>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
