<script setup lang="ts">
const route = useRoute();
const employeeId = computed(() => String(route.params.id));
const { data } = await useFetch(`/api/employees/${employeeId.value}/runs`, {
  key: computed(() => `employee-runs:${employeeId.value}:history`)
});
</script>

<template>
  <article class="stack-card section-card">
    <div class="section-header">
      <div>
        <p class="eyebrow">Run History</p>
        <h2>这个员工最近做了什么</h2>
      </div>
      <NuxtLink class="ghost-link" to="/runs">进入运行中心</NuxtLink>
    </div>
    <div class="run-feed">
      <NuxtLink v-for="run in data?.data ?? []" :key="run.id" class="run-feed-card compact" :to="`/runs?runId=${run.id}`">
        <div class="run-feed-header">
          <strong>{{ run.status }}</strong>
          <span>{{ run.startedAt }}</span>
        </div>
        <p class="run-feed-highlight">{{ run.summary || "等待结果摘要" }}</p>
      </NuxtLink>
      <EmptyState
        v-if="(data?.data ?? []).length === 0"
        title="还没有运行历史"
        description="先通过聊天或自动任务触发一次执行，记录就会出现在这里。"
      />
    </div>
  </article>
</template>
