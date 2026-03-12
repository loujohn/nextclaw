<script setup lang="ts">
import { formatScheduleSummary } from "~~/shared/ui-models";

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
  if (!schedule) {
    return;
  }
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
  <div class="overview-stack" v-if="data?.data">
    <article class="stack-card overview-card feature-panel">
      <div class="section-header">
        <div>
          <p class="eyebrow">Role Brief</p>
          <h2>职责与人设</h2>
        </div>
        <NuxtLink class="ghost-link" :to="`/employees/${employeeId}/chat`">进入聊天工作台</NuxtLink>
      </div>
      <p class="overview-copy">{{ data.data.description || "未填写职责说明" }}</p>
      <pre class="code-block">{{ data.data.systemPrompt || "尚未配置系统提示词" }}</pre>
    </article>

    <div class="overview-grid">
      <article class="stack-card overview-card">
        <p class="eyebrow">Automation</p>
        <h2>自动任务</h2>
        <p class="overview-copy">{{ formatScheduleSummary(data.data.schedule) }}</p>
        <form class="stack-form" @submit.prevent="saveSchedule">
          <label>
            运行方式
            <select v-model="scheduleForm.scheduleKind">
              <option value="cron">每日/定时</option>
              <option value="every">固定间隔</option>
              <option value="heartbeat">心跳巡检</option>
            </select>
          </label>
          <label v-if="scheduleForm.scheduleKind === 'cron'">
            Cron 表达式
            <input v-model="scheduleForm.cronExpr" />
          </label>
          <label v-else>
            间隔毫秒
            <input v-model.number="scheduleForm.everyMs" type="number" min="1000" />
          </label>
          <button class="primary-button">保存自动任务</button>
        </form>
      </article>

      <article class="stack-card overview-card">
        <p class="eyebrow">Latest Output</p>
        <h2>最近结果</h2>
        <div class="mini-feed">
          <NuxtLink v-for="run in data.data.recentRuns.slice(0, 4)" :key="run.id" class="mini-feed-row" :to="`/runs?runId=${run.id}`">
            <strong>{{ run.status }}</strong>
            <span>{{ run.summary || run.startedAt }}</span>
          </NuxtLink>
          <p v-if="data.data.recentRuns.length === 0" class="muted">还没有最近结果，可以先进入聊天页手动触发一次。</p>
        </div>
      </article>
    </div>
  </div>
</template>
