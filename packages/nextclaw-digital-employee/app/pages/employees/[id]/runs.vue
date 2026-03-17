<script setup lang="ts">
import { formatRunStatusLabel, formatDateTime } from "~~/shared/ui-models";
import { renderMarkdown } from "~/lib/utils";
import { Sparkles, X } from "lucide-vue-next";

const route = useRoute();
const employeeId = computed(() => String(route.params.id));
const { data } = await useFetch(`/api/employees/${employeeId.value}/runs`, {
  key: computed(() => `employee-runs:${employeeId.value}:history`)
});

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

const selectedRunId = ref("");
const selectedRun = ref<RunDetailPayload | null>(null);
const loadingDetail = ref(false);

async function openDetail(runId: string) {
  selectedRunId.value = runId;
  loadingDetail.value = true;
  try {
    selectedRun.value = await $fetch<RunDetailPayload>(`/api/runs/${runId}`);
  } finally {
    loadingDetail.value = false;
  }
}

function closeDetail() {
  selectedRunId.value = "";
  selectedRun.value = null;
}
</script>

<template>
  <div class="rounded-xl border border-border bg-card p-5 shadow-sm">
    <div class="mb-4 flex items-center justify-between">
      <div>
        <span class="section-label">历史记录</span>
        <h2 class="mt-0.5 text-lg font-semibold">运行历史</h2>
      </div>
      <NuxtLink to="/runs" class="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
        运行中心 →
      </NuxtLink>
    </div>

    <div class="space-y-2">
      <button
        v-for="run in (data as any)?.data ?? []"
        :key="run.id"
        class="group block w-full rounded-lg border border-border p-3 text-left transition-all hover:border-primary/20 hover:shadow-sm"
        :class="selectedRunId === run.id ? 'border-primary/30 bg-primary/5' : ''"
        @click="openDetail(run.id)"
      >
        <div class="flex items-center justify-between gap-2">
          <span class="shrink-0 whitespace-nowrap text-sm font-semibold group-hover:text-primary">{{ formatRunStatusLabel(run.status) }}</span>
          <span class="min-w-0 truncate text-xs text-muted-foreground">{{ formatDateTime(run.startedAt) }}</span>
        </div>
        <div
          class="run-detail-md mt-1.5 max-h-24 overflow-y-auto text-sm text-muted-foreground"
          v-html="renderMarkdown(run.summary || '\u7b49\u5f85\u7ed3\u679c\u6458\u8981')"
        />
      </button>
    </div>

    <div
      v-if="((data as any)?.data ?? []).length === 0"
      class="mt-4 flex items-center gap-3 rounded-lg border border-dashed border-border p-4"
    >
      <Sparkles class="h-4 w-4 shrink-0 text-primary" :stroke-width="1.8" />
      <div>
        <p class="text-sm font-medium">还没有运行历史</p>
        <p class="text-xs text-muted-foreground">先通过聊天或自动任务触发一次执行。</p>
      </div>
    </div>
  </div>

  <!-- Detail Slide-over -->
  <Teleport to="body">
    <Transition name="slide-over">
      <div v-if="selectedRun?.data" class="fixed inset-0 z-50 flex justify-end">
        <div class="absolute inset-0 bg-foreground/20 backdrop-blur-sm" @click="closeDetail" />
        <div class="slide-over-panel relative w-full max-w-lg overflow-y-auto bg-card shadow-2xl">
          <div class="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card/95 px-6 py-4 backdrop-blur-sm">
            <div>
              <span class="section-label">运行详情</span>
              <h2 class="mt-0.5 text-lg font-semibold">{{ selectedRun.data.employeeName }}</h2>
            </div>
            <button class="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" @click="closeDetail">
              <X class="h-5 w-5" :stroke-width="1.8" />
            </button>
          </div>

          <div class="p-6 space-y-5">
            <!-- Meta -->
            <div class="grid grid-cols-3 gap-4">
              <div class="rounded-lg bg-muted/30 p-3">
                <p class="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">触发方式</p>
                <p class="mt-1 text-sm font-semibold">{{ selectedRun.data.triggerLabel }}</p>
              </div>
              <div class="rounded-lg bg-muted/30 p-3">
                <p class="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">状态</p>
                <p class="mt-1 text-sm font-semibold">{{ selectedRun.data.statusLabel }}</p>
              </div>
              <div class="rounded-lg bg-muted/30 p-3">
                <p class="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">事件数</p>
                <p class="mt-1 text-sm font-semibold">{{ selectedRun.data.events.length }}</p>
              </div>
            </div>

            <!-- Summary -->
            <div>
              <span class="section-label">结果摘要</span>
              <div
                class="run-detail-md mt-2 max-h-64 overflow-y-auto rounded-lg bg-muted/20 px-4 py-3 text-sm leading-relaxed text-muted-foreground"
                v-html="renderMarkdown(selectedRun.data.summary || '等待结果摘要')"
              />
            </div>

            <!-- Events -->
            <div>
              <span class="section-label">关键事件</span>
              <div class="mt-2 space-y-2">
                <div
                  v-for="event in selectedRun.data.events"
                  :key="event.id"
                  class="flex items-center gap-3 rounded-lg bg-muted/30 px-3 py-2.5"
                >
                  <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">{{ event.seq }}</span>
                  <span class="text-sm">{{ event.eventType }}</span>
                </div>
                <p v-if="selectedRun.data.events.length === 0" class="text-sm text-muted-foreground">暂无事件记录。</p>
              </div>
            </div>

            <!-- Raw Result -->
            <details class="rounded-lg border border-border">
              <summary class="cursor-pointer px-4 py-3 text-sm font-medium hover:bg-muted/30 transition-colors">查看原始结果</summary>
              <pre class="overflow-auto border-t border-border bg-muted/20 px-4 py-3 font-mono text-xs leading-relaxed">{{ JSON.stringify(selectedRun.data.result, null, 2) }}</pre>
            </details>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
