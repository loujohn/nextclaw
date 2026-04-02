<script setup lang="ts">
import { Sparkles, X, Play, CheckCircle2, AlertTriangle, Clock, ChevronLeft, ChevronRight, CalendarClock } from "lucide-vue-next";
import { renderMarkdown } from "~/lib/utils";
import { formatDateTime } from "~~/shared/ui-models";

type RunItem = {
  id: string;
  employeeName: string;
  statusLabel: string;
  triggerLabel: string;
  scheduleJobName: string | null;
  summary: string;
  highlight: string;
  tone: "teal" | "amber" | "slate" | "danger";
  startedAtLabel: string;
};

type RunListPayload = {
  ok: boolean;
  data: {
    items: RunItem[];
    total: number;
    page: number;
    pageSize: number;
  };
};

type RunDetailPayload = {
  ok: boolean;
  data: {
    employeeName: string;
    statusLabel: string;
    triggerLabel: string;
    scheduleJobName: string | null;
    summary: string;
    result: Record<string, unknown>;
    events: Array<{ id: string; seq: number; eventType: string; payload: Record<string, unknown>; createdAt: string }>;
  };
};

type ToneFilter = "teal" | "amber" | "danger" | null;

const TONE_TO_STATUS: Record<string, string> = {
  teal: "completed",
  amber: "running",
  danger: "failed"
};

const PAGE_SIZE = 10;

const currentPage = ref(1);
const statusFilter = ref<ToneFilter>(null);
const selectedRunId = ref("");
const selectedRun = ref<RunDetailPayload | null>(null);
const loadingDetail = ref(false);

function buildApiUrl() {
  const params = new URLSearchParams({ page: String(currentPage.value), pageSize: String(PAGE_SIZE) });
  if (statusFilter.value) {
    params.set("status", TONE_TO_STATUS[statusFilter.value] ?? "");
  }
  return `/api/runs?${params.toString()}`;
}

const { data, pending } = await useFetch<RunListPayload>(() => buildApiUrl());

const runs = computed(() => data.value?.data.items ?? []);
const total = computed(() => data.value?.data.total ?? 0);
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / PAGE_SIZE)));

const visiblePages = computed(() => {
  const tp = totalPages.value;
  const cp = currentPage.value;
  if (tp <= 7) {
    return Array.from({ length: tp }, (_, i) => i + 1) as (number | "...")[];
  }
  const pages: (number | "...")[] = [1];
  if (cp > 3) pages.push("...");
  for (let p = Math.max(2, cp - 1); p <= Math.min(tp - 1, cp + 1); p++) {
    pages.push(p);
  }
  if (cp < tp - 2) pages.push("...");
  pages.push(tp);
  return pages;
});

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

function setFilter(tone: ToneFilter) {
  statusFilter.value = tone;
  currentPage.value = 1;
}

function goToPage(page: number) {
  if (page < 1 || page > totalPages.value) return;
  currentPage.value = page;
}

const toneConfig: Record<string, { dot: string; border: string; icon: typeof CheckCircle2 }> = {
  teal: { dot: "bg-primary", border: "border-primary/20", icon: CheckCircle2 },
  amber: { dot: "bg-amber-400", border: "border-amber-200", icon: Clock },
  slate: { dot: "bg-muted-foreground", border: "border-border", icon: Clock },
  danger: { dot: "bg-destructive", border: "border-destructive/20", icon: AlertTriangle }
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

    <!-- Status Filters & Total -->
    <div class="flex flex-wrap items-center gap-3">
      <button
        class="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-all"
        :class="statusFilter === null ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'"
        @click="setFilter(null)"
      >
        全部
        <span v-if="statusFilter === null" class="opacity-60">{{ total }}</span>
      </button>
      <button
        class="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-all"
        :class="statusFilter === 'teal' ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'"
        @click="setFilter(statusFilter === 'teal' ? null : 'teal')"
      >
        <CheckCircle2 class="h-3.5 w-3.5" :stroke-width="2" />
        已完成
        <span v-if="statusFilter === 'teal'" class="opacity-60">{{ total }}</span>
      </button>
      <button
        class="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-all"
        :class="statusFilter === 'amber' ? 'bg-amber-400 text-white shadow-sm' : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'"
        @click="setFilter(statusFilter === 'amber' ? null : 'amber')"
      >
        <Play class="h-3.5 w-3.5" :stroke-width="2" />
        执行中
        <span v-if="statusFilter === 'amber'" class="opacity-60">{{ total }}</span>
      </button>
      <button
        class="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-all"
        :class="statusFilter === 'danger' ? 'bg-destructive text-destructive-foreground shadow-sm' : 'bg-destructive/10 text-destructive hover:bg-destructive/20'"
        @click="setFilter(statusFilter === 'danger' ? null : 'danger')"
      >
        <AlertTriangle class="h-3.5 w-3.5" :stroke-width="2" />
        失败
        <span v-if="statusFilter === 'danger'" class="opacity-60">{{ total }}</span>
      </button>
      <span class="ml-auto text-xs text-muted-foreground">共 {{ total }} 条记录</span>
    </div>

    <!-- Loading State -->
    <div v-if="pending" class="flex flex-col items-center py-16 text-center">
      <div class="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      <p class="mt-3 text-sm text-muted-foreground">加载中...</p>
    </div>

    <!-- Table List -->
    <div v-else-if="runs.length > 0" class="overflow-x-auto rounded-xl border border-border">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-border bg-muted/40 text-xs text-muted-foreground">
            <th class="px-4 py-3 text-left font-medium">员工</th>
            <th class="px-4 py-3 text-left font-medium">状态</th>
            <th class="px-4 py-3 text-left font-medium">触发方式</th>
            <th class="px-4 py-3 text-left font-medium">摘要</th>
            <th class="px-4 py-3 text-left font-medium whitespace-nowrap">开始时间</th>
            <th class="px-4 py-3 text-left font-medium"></th>
          </tr>
        </thead>
        <tbody class="divide-y divide-border">
          <tr
            v-for="run in runs"
            :key="run.id"
            class="transition-colors hover:bg-muted/30"
            :class="selectedRunId === run.id ? 'bg-primary/5' : ''"
          >
            <td class="px-4 py-3">
              <div class="flex items-center gap-2">
                <span
                  class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted/40"
                  :class="run.tone === 'amber' ? 'animate-pulse' : ''"
                >
                  <span class="h-2 w-2 rounded-full" :class="toneConfig[run.tone]?.dot ?? 'bg-muted-foreground'" />
                </span>
                <span class="font-medium">{{ run.employeeName }}</span>
              </div>
            </td>
            <td class="px-4 py-3">
              <span class="rounded-full px-2 py-0.5 text-[11px] font-semibold" :class="badgeClass[run.tone]">
                {{ run.statusLabel }}
              </span>
            </td>
            <td class="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
              {{ run.triggerLabel }}<span v-if="run.scheduleJobName" class="text-primary"> · {{ run.scheduleJobName }}</span>
            </td>
            <td class="max-w-xs px-4 py-3">
              <p v-if="run.highlight" class="truncate text-sm font-medium text-foreground/80">{{ run.highlight }}</p>
              <p v-else-if="run.summary" class="truncate text-xs text-muted-foreground">{{ run.summary }}</p>
              <span v-else class="text-xs text-muted-foreground/40">—</span>
            </td>
            <td class="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{{ run.startedAtLabel }}</td>
            <td class="px-4 py-3">
              <button
                class="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all duration-150 bg-muted/60 text-muted-foreground hover:bg-primary hover:text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed"
                :disabled="selectedRunId === run.id && loadingDetail"
                @click="openDetail(run.id)"
              >
                <component :is="toneConfig[run.tone]?.icon ?? Clock" class="h-3 w-3" :stroke-width="2" />
                详情
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Empty State -->
    <div
      v-else-if="!pending"
      class="flex flex-col items-center rounded-2xl border border-dashed border-border bg-muted/10 px-6 py-12 text-center"
    >
      <div class="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/5">
        <Sparkles class="h-7 w-7 text-primary/30" :stroke-width="1.5" />
      </div>
      <p class="font-medium">{{ statusFilter !== null ? '没有符合条件的记录' : '还没有运行记录' }}</p>
      <p class="mt-1 max-w-xs text-sm text-muted-foreground">员工开始自动运行或收到聊天指令后，记录会在这里集中展示。</p>
    </div>

    <!-- Pagination -->
    <div v-if="!pending && totalPages > 1" class="flex items-center justify-center gap-2 pt-2">
      <button
        class="flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium transition-all"
        :class="currentPage <= 1 ? 'opacity-40 cursor-not-allowed bg-muted/30 text-muted-foreground' : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'"
        :disabled="currentPage <= 1"
        @click="goToPage(currentPage - 1)"
      >
        <ChevronLeft class="h-4 w-4" :stroke-width="2" />
        上一页
      </button>

      <div class="flex items-center gap-1">
        <template v-for="(p, i) in visiblePages" :key="i">
          <span v-if="p === '...'" class="flex h-8 w-6 items-center justify-center text-sm text-muted-foreground">…</span>
          <button
            v-else
            class="flex h-8 w-8 items-center justify-center rounded-lg text-sm font-medium transition-all"
            :class="p === currentPage ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'"
            @click="goToPage(p as number)"
          >
            {{ p }}
          </button>
        </template>
      </div>

      <button
        class="flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium transition-all"
        :class="currentPage >= totalPages ? 'opacity-40 cursor-not-allowed bg-muted/30 text-muted-foreground' : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'"
        :disabled="currentPage >= totalPages"
        @click="goToPage(currentPage + 1)"
      >
        下一页
        <ChevronRight class="h-4 w-4" :stroke-width="2" />
      </button>
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

              <!-- Schedule Job Source -->
              <div v-if="selectedRun.data.scheduleJobName" class="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5">
                <CalendarClock class="h-4 w-4 shrink-0 text-primary" :stroke-width="1.8" />
                <div>
                  <p class="text-[11px] font-medium text-muted-foreground">来源定时任务</p>
                  <p class="text-sm font-semibold text-primary">{{ selectedRun.data.scheduleJobName }}</p>
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
                    class="rounded-lg bg-muted/30 px-3 py-2.5"
                  >
                    <div class="flex items-center gap-3">
                      <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">{{ event.seq }}</span>
                      <span class="text-sm font-medium">{{ event.eventType }}</span>
                      <span v-if="event.createdAt" class="ml-auto text-[11px] text-muted-foreground">{{ formatDateTime(event.createdAt) }}</span>
                    </div>
                    <div v-if="event.payload && Object.keys(event.payload).length > 0" class="mt-1.5 ml-9">
                      <pre class="max-h-32 overflow-auto rounded bg-background/50 p-2 text-[11px] leading-relaxed text-muted-foreground">{{ JSON.stringify(event.payload, null, 2) }}</pre>
                    </div>
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
