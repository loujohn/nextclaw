<script setup lang="ts">
type RunListPayload = {
  ok: boolean;
  data: {
    items: Array<{
      id: string;
      employeeName: string;
      statusLabel: string;
      triggerLabel: string;
      summary: string;
      highlight: string;
      tone: "teal" | "amber" | "slate" | "danger";
      startedAtLabel: string;
    }>;
  };
};

type RunDetailPayload = {
  ok: boolean;
  data: {
    employeeName: string;
    statusLabel: string;
    triggerLabel: string;
    summary: string;
    result: Record<string, unknown>;
    events: Array<{ id: string; seq: number; eventType: string }>;
  };
};

const route = useRoute();
const selectedRunId = computed(() => {
  const raw = route.query.runId;
  return typeof raw === "string" ? raw : "";
});
const { data } = await useFetch<RunListPayload>("/api/runs");
const selectedRun = ref<RunDetailPayload | null>(null);

watchEffect(async () => {
  if (!selectedRunId.value) {
    selectedRun.value = null;
    return;
  }
  selectedRun.value = await $fetch<RunDetailPayload>(`/api/runs/${selectedRunId.value}`);
});
</script>

<template>
  <main class="app-shell">
    <AppNav />
    <section class="page-panel run-page-shell">
      <div class="page-heading">
        <div>
          <p class="eyebrow">Runs</p>
          <h1>在这里追踪所有员工的执行、失败和结果沉淀</h1>
        </div>
      </div>

      <div class="runs-layout">
        <section class="run-feed stack-card">
          <div class="section-header">
            <div>
              <p class="eyebrow">All Runs</p>
              <h2>运行列表</h2>
            </div>
          </div>
          <NuxtLink
            v-for="run in data?.data.items ?? []"
            :key="run.id"
            class="run-feed-card"
            :to="`/runs?runId=${run.id}`"
          >
            <div class="run-feed-header">
              <div>
                <strong>{{ run.employeeName }}</strong>
                <p>{{ run.triggerLabel }} · {{ run.startedAtLabel }}</p>
              </div>
              <StatusBadge :label="run.statusLabel" :tone="run.tone" />
            </div>
            <p class="run-feed-highlight">{{ run.highlight }}</p>
            <p class="run-feed-summary">{{ run.summary }}</p>
          </NuxtLink>
          <EmptyState
            v-if="(data?.data.items ?? []).length === 0"
            title="还没有运行记录"
            description="员工开始自动运行或收到聊天指令后，运行记录会在这里集中展示。"
          />
        </section>

        <aside class="stack-card run-detail-panel">
          <div class="section-header">
            <div>
              <p class="eyebrow">Run Detail</p>
              <h2>运行详情</h2>
            </div>
          </div>

          <template v-if="selectedRun?.data">
            <div class="detail-meta">
              <div>
                <span class="metric-label">员工</span>
                <strong>{{ selectedRun.data.employeeName }}</strong>
              </div>
              <div>
                <span class="metric-label">触发方式</span>
                <strong>{{ selectedRun.data.triggerLabel }}</strong>
              </div>
              <div>
                <span class="metric-label">状态</span>
                <strong>{{ selectedRun.data.statusLabel }}</strong>
              </div>
            </div>

            <article class="detail-block">
              <p class="eyebrow">Summary</p>
              <h3>结果摘要</h3>
              <p>{{ selectedRun.data.summary || "等待结果摘要" }}</p>
            </article>

            <article class="detail-block">
              <p class="eyebrow">Events</p>
              <h3>关键事件</h3>
              <ul class="event-list">
                <li v-for="event in selectedRun.data.events" :key="event.id">
                  <strong>#{{ event.seq }}</strong>
                  <span>{{ event.eventType }}</span>
                </li>
              </ul>
            </article>

            <details class="detail-block detail-json">
              <summary>查看原始结果</summary>
              <pre class="code-block">{{ JSON.stringify(selectedRun.data.result, null, 2) }}</pre>
            </details>
          </template>

          <EmptyState
            v-else
            title="先选择一条运行记录"
            description="左侧列表会优先显示员工、触发方式、状态和摘要，再在这里查看完整细节。"
          />
        </aside>
      </div>
    </section>
  </main>
</template>
