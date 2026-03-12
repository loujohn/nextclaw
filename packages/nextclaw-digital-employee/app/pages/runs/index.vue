<script setup lang="ts">
import { Sparkles, X, Play, CheckCircle2, AlertTriangle, Clock, ChevronRight } from "lucide-vue-next";

type RunItem = {
  id: string;
  employeeName: string;
  statusLabel: string;
  triggerLabel: string;
  summary: string;
  highlight: string;
  tone: "teal" | "amber" | "slate" | "danger";
  startedAtLabel: string;
};

type RunListPayload = { ok: boolean; data: { items: RunItem[] } };

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

const { data } = await useFetch<RunListPayload>("/api/runs");
const selectedRunId = ref("");
const selectedRun = ref<RunDetailPayload | null>(null);
const statusFilter = ref<string | null>(null);
const loadingDetail = ref(false);

const runs = computed(() => data.value?.data.items ?? []);

const filteredRuns = computed(() => {
  if (!statusFilter.value) return runs.value;
  return runs.value.filter((r) => r.tone === statusFilter.value);
});

const stats = computed(() => {
  const items = runs.value;
  return {
    total: items.length,
    completed: items.filter((r) => r.tone === "teal").length,
    running: items.filter((r) => r.tone === "amber").length,
    failed: items.filter((r) => r.tone === "danger").length
  };
});

async function openDetail(run: RunItem) {
  selectedRunId.value = run.id;
  loadingDetail.value = true;
  try {
    selectedRun.value = await $fetch<RunDetailPayload>(`/api/runs/${run.id}`);
  } finally {
    loadingDetail.value = false;
  }
}

function closeDetail() {
  selectedRunId.value = "";
  selectedRun.value = null;
}

const toneConfig: Record<string, { dot: string; icon: typeof CheckCircle2 }> = {
  teal: { dot: "bg-primary", icon: CheckCircle2 },
  amber: { dot: "bg-amber-400", icon: Clock },
  slate: { dot: "bg-muted-foreground", icon: Clock },
  danger: { dot: "bg-destructive", icon: AlertTriangle }
};

const badgeClass: Record<string, string> = {
  teal: "bg-primary/10 text-primary",
  amber: "bg-amber-50 text-amber-600",
  slate: "bg-muted text-muted-foreground",
  danger: "bg-destructive/10 text-destructive"
};
</script>

<template>
  <div class="mx-auto max-w-6xl space-y-6 p-6 lg:p-8">
    <!-- Header -->
    <div class="hero-section">
      <div class="relative space-y-1">
        <span class="section-label">执行追踪</span>
        <h1 class="font-display text-3xl font-bold tracking-tight">运行中心</h1>
        <p class="text-sm text-muted-foreground">追踪所有员工的执行、结果和关键事件。</p>
      </div>
    </div>

    <!-- Status Filters -->
    <div class="flex flex-wrap items-center gap-3">
      <button
        class="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-all"
        :class="statusFilter === null ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'"
        @click="statusFilter = null"
      >
        全部 <span class="opacity-60">{{ stats.total }}</span>
      </button>
      <button
        class="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-all"
        :class="statusFilter === 'teal' ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'"
        @click="statusFilter = statusFilter === 'teal' ? null : 'teal'"
      >
        <CheckCircle2 class="h-3.5 w-3.5" :stroke-width="2" />
        已完成 <span class="opacity-60">{{ stats.completed }}</span>
      </button>
      <button
        class="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-all"
        :class="statusFilter === 'amber' ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'"
        @click="statusFilter = statusFilter === 'amber' ? null : 'amber'"
      >
        <Play class="h-3.5 w-3.5" :stroke-width="2" />
        执行中 <span class="opacity-60">{{ stats.running }}</span>
      </button>
      <button
        v-if="stats.failed > 0"
        class="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-all"
        :class="statusFilter === 'danger' ? 'bg-destructive text-destructive-foreground shadow-sm' : 'bg-destructive/10 text-destructive hover:bg-destructive/20'"
        @click="statusFilter = statusFilter === 'danger' ? null : 'danger'"
      >
        <AlertTriangle class="h-3.5 w-3.5" :stroke-width="2" />
        失败 <span class="opacity-60">{{ stats.failed }}</span>
      </button>
    </div>

    <!-- Timeline List -->
    <div class="relative">
      <div v-if="filteredRuns.length > 1" class="absolute left-[19px] top-2 bottom-2 w-px bg-border" />

      <div class="stagger-in space-y-1">
        <button
          v-for="run in filteredRuns"
          :key="run.id"
          class="relative flex w-full items-start gap-4 rounded-xl px-4 py-3.5 text-left transition-all duration-150"
          :class="selectedRunId === run.id ? 'bg-primary/5' : 'hover:bg-muted/40'"
          @click="openDetail(run)"
        >
          <div class="relative z-10 mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-card ring-2 ring-card"
            :class="run.tone === 'amber' && 'animate-pulse'"
          >
            <span class="h-2.5 w-2.5 rounded-full" :class="(toneConfig[run.tone] ?? toneConfig.slate).dot" />
          </div>

          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2">
              <span class="text-sm font-semibold">{{ run.employeeName }}</span>
              <span class="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold" :class="badgeClass[run.tone]">
                {{ run.statusLabel }}
              </span>
            </div>
            <p class="mt-0.5 text-xs text-muted-foreground">{{ run.triggerLabel }} · {{ run.startedAtLabel }}</p>
            <p v-if="run.highlight" class="mt-1.5 text-sm font-medium text-foreground/80">{{ run.highlight }}</p>
            <p v-if="run.summary" class="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{{ run.summary }}</p>
          </div>

          <ChevronRight class="mt-1 h-4 w-4 shrink-0 text-muted-foreground/40" :stroke-width="1.8" />
        </button>
      </div>

      <div
        v-if="filteredRuns.length === 0"
        class="flex flex-col items-center rounded-2xl border border-dashed border-border bg-muted/10 px-6 py-12 text-center"
      >
        <div class="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/5">
          <Sparkles class="h-7 w-7 text-primary/30" :stroke-width="1.5" />
        </div>
        <p class="font-medium">{{ statusFilter ? '没有符合条件的记录' : '还没有运行记录' }}</p>
        <p class="mt-1 max-w-xs text-sm text-muted-foreground">员工开始自动运行或收到聊天指令后，记录会在这里集中展示。</p>
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
                <p class="mt-2 text-sm leading-relaxed text-muted-foreground">{{ selectedRun.data.summary || "等待结果摘要" }}</p>
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
  </div>
</template>
