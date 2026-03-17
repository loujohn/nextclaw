<script setup lang="ts">
import { formatScheduleSummary, formatRunStatusLabel, formatDateTime, translateRunText } from "~~/shared/ui-models";
import { renderMarkdown } from "~/lib/utils";
import { MessageSquare } from "lucide-vue-next";

const route = useRoute();
const employeeId = computed(() => String(route.params.id));
const { data, refresh } = await useEmployeeDetail(employeeId);

const scheduleForm = reactive({
  scheduleKind: "cron",
  cronExpr: "0 18 * * *",
  everyMs: 1800000
});

watchEffect(() => {
  const schedule = data.value?.data.schedule;
  if (!schedule) return;
  scheduleForm.scheduleKind = (schedule.scheduleKind as "cron" | "every" | "heartbeat") ?? "cron";
  scheduleForm.cronExpr = schedule.cronExpr ?? "0 18 * * *";
  scheduleForm.everyMs = schedule.everyMs ?? 1800000;
});

async function saveSchedule() {
  await $fetch(`/api/employees/${employeeId.value}/schedule`, {
    method: "PATCH",
    body: scheduleForm
  });
  await refresh();
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

    <div class="grid gap-5 lg:grid-cols-2">
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
  </div>
</template>
