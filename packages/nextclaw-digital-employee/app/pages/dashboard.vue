<script setup lang="ts">
import { formatDateTime } from "~~/shared/ui-models";
import { renderMarkdown } from "~/lib/utils";
import {
  Users, Clock, AlertTriangle, Blocks, ArrowRight, Sparkles,
  X, Play, CheckCircle2, ChevronLeft, ChevronRight, CalendarClock
} from "lucide-vue-next";

// ---- Dashboard types ----
type DashboardPayload = {
  ok: boolean;
  data: {
    summary: {
      totalEmployees: number;
      activeEmployees: number;
      scheduledEmployees: number;
      failedRuns: number;
      enabledSkills: number;
    };
    alerts: Array<{
      id: string;
      title: string;
      description: string;
      tone: "amber" | "rose" | "slate";
      to: string;
      actionLabel: string;
    }>;
    quickActions: Array<{ id: string; label: string; to: string }>;
    upcomingEmployees: Array<{
      id: string;
      name: string;
      description: string;
      schedule: { nextRunAt?: string | null; scheduleKind: string } | null;
    }>;
  };
};

// ---- Runs types ----
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

// ---- Dashboard data ----
const { data, pending } = await useFetch<DashboardPayload>("/api/dashboard");

// ---- Runs state ----
const runsPage = ref(1);
const runsStatusFilter = ref<ToneFilter>(null);
const selectedRunId = ref("");
const selectedRun = ref<RunDetailPayload | null>(null);
const loadingDetail = ref(false);

function buildRunsApiUrl() {
  const params = new URLSearchParams({ page: String(runsPage.value), pageSize: String(PAGE_SIZE) });
  if (runsStatusFilter.value) {
    params.set("status", TONE_TO_STATUS[runsStatusFilter.value] ?? "");
  }
  return `/api/runs?${params.toString()}`;
}

const { data: runsData, pending: runsPending } = await useFetch<RunListPayload>(() => buildRunsApiUrl());

const runs = computed(() => runsData.value?.data.items ?? []);
const runsTotal = computed(() => runsData.value?.data.total ?? 0);
const totalRunPages = computed(() => Math.max(1, Math.ceil(runsTotal.value / PAGE_SIZE)));

const visibleRunPages = computed(() => {
  const tp = totalRunPages.value;
  const cp = runsPage.value;
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

// ---- Summary cards ----
const summaryCards = computed(() => {
  const s = data.value?.data.summary;
  if (!s) return [];
  const total = Math.max(s.totalEmployees, 1);
  return [
    { label: "员工总数", value: s.totalEmployees, icon: Users, color: "text-primary" as const, bg: "bg-primary/10" as const, barColor: "bg-primary" as const, barPct: 100 },
    { label: "自动运行", value: s.scheduledEmployees, icon: Clock, color: "text-warning" as const, bg: "bg-warning/10" as const, barColor: "bg-warning" as const, barPct: Math.round((s.scheduledEmployees / total) * 100) },
    { label: "失败待处理", value: s.failedRuns, icon: AlertTriangle, color: "text-destructive" as const, bg: "bg-destructive/10" as const, barColor: "bg-destructive" as const, barPct: Math.round((s.failedRuns / total) * 100) },
    { label: "已启用技能", value: s.enabledSkills, icon: Blocks, color: "text-muted-foreground" as const, bg: "bg-muted" as const, barColor: "bg-muted-foreground" as const, barPct: Math.min(s.enabledSkills * 20, 100) }
  ];
});

// ---- Tone configs ----
const toneClass: Record<string, string> = {
  teal: "border-primary/20 bg-primary/5",
  amber: "border-warning/20 bg-warning/5",
  slate: "border-border",
  danger: "border-destructive/20 bg-destructive/5",
  rose: "border-destructive/20 bg-destructive/5"
};

const badgeClass: Record<string, string> = {
  teal: "bg-primary/10 text-primary",
  amber: "bg-amber-50 text-amber-600",
  slate: "bg-muted text-muted-foreground",
  danger: "bg-destructive/10 text-destructive"
};

const toneConfig: Record<string, { dot: string; border: string; icon: typeof CheckCircle2 }> = {
  teal: { dot: "bg-primary", border: "border-primary/20", icon: CheckCircle2 },
  amber: { dot: "bg-amber-400", border: "border-amber-200", icon: Clock },
  slate: { dot: "bg-muted-foreground", border: "border-border", icon: Clock },
  danger: { dot: "bg-destructive", border: "border-destructive/20", icon: AlertTriangle }
};

// ---- Runs actions ----
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

function setRunsFilter(tone: ToneFilter) {
  runsStatusFilter.value = tone;
  runsPage.value = 1;
}

function goToRunsPage(page: number) {
  if (page < 1 || page > totalRunPages.value) return;
  runsPage.value = page;
}
</script>

<template>
  <PageSkeleton v-if="pending && !data" />
  <div v-else class="mx-auto max-w-6xl space-y-6 p-6 lg:p-8">
    <!-- Header -->
    <header class="hero-section">
      <div class="relative space-y-3">
        <span class="section-label">工作中心</span>
        <h1 class="font-display text-3xl font-bold tracking-tight lg:text-4xl">
          平台运行全景
        </h1>
        <p class="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          汇聚数字员工运行态势、异常预警、执行记录与系统数据统计，一屏掌控全局。
        </p>
        <div class="flex flex-wrap gap-2 pt-1">
          <NuxtLink
            v-for="action in data?.data.quickActions ?? []"
            :key="action.id"
            :to="action.to"
            class="btn-primary"
          >
            {{ action.label }}
            <ArrowRight class="h-3.5 w-3.5" />
          </NuxtLink>
        </div>
      </div>
    </header>

    <!-- Summary Cards -->
    <section class="stagger-in grid grid-cols-2 gap-4 lg:grid-cols-4">
      <article
        v-for="card in summaryCards"
        :key="card.label"
        class="group relative overflow-hidden rounded-xl border border-border bg-card p-4 transition-all duration-200 hover:border-primary/15 hover:shadow-md"
      >
        <div class="absolute inset-0 opacity-0 transition-opacity duration-200 group-hover:opacity-100" :class="card.bg" style="opacity: 0.03;" />
        <div class="relative">
          <div class="mb-3 flex h-9 w-9 items-center justify-center rounded-lg" :class="card.bg">
            <component :is="card.icon" class="h-[18px] w-[18px] transition-transform duration-200 group-hover:scale-110" :class="card.color" :stroke-width="1.8" />
          </div>
          <p class="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">{{ card.label }}</p>
          <p class="mt-1 font-display text-2xl font-bold tracking-tight">{{ card.value }}</p>
          <div class="mt-2 h-1 w-full overflow-hidden rounded-full bg-muted">
            <div class="h-full rounded-full transition-all duration-700 ease-out" :class="card.barColor" :style="{ width: card.barPct + '%' }" />
          </div>
        </div>
      </article>
    </section>

    <!-- Alerts -->
    <section class="space-y-3">
      <article
        v-for="alert in data?.data.alerts ?? []"
        :key="alert.id"
        class="flex items-center justify-between gap-4 rounded-xl border p-4"
        :class="toneClass[alert.tone]"
      >
        <div>
          <p class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">待处理</p>
          <p class="mt-1 font-medium">{{ alert.title }}</p>
          <p class="text-sm text-muted-foreground">{{ alert.description }}</p>
        </div>
        <NuxtLink
          :to="alert.to"
          class="shrink-0 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
        >
          {{ alert.actionLabel }}
        </NuxtLink>
      </article>

      <div
        v-if="(data?.data.alerts ?? []).length === 0"
        class="flex items-center gap-3 rounded-xl border border-dashed border-border bg-muted/30 p-4"
      >
        <div class="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
          <Sparkles class="h-4 w-4 text-primary" :stroke-width="1.8" />
        </div>
        <div>
          <p class="text-sm font-medium">当前没有阻塞项</p>
          <p class="text-xs text-muted-foreground">模型、自动任务和最近运行都处于稳定状态。</p>
        </div>
      </div>
    </section>

    <!-- Two Column Grid: Upcoming + Run Stats -->
    <div class="grid gap-6 lg:grid-cols-2">
      <!-- Upcoming Employees -->
      <section>
        <div class="mb-3 flex items-center justify-between">
          <div>
            <span class="section-label">即将运行</span>
            <h2 class="mt-0.5 text-lg font-semibold">等待执行的员工</h2>
          </div>
          <NuxtLink to="/employees" class="text-sm font-medium text-muted-foreground transition-colors hover:text-primary">
            员工中心 →
          </NuxtLink>
        </div>

        <div class="space-y-2">
          <NuxtLink
            v-for="emp in data?.data.upcomingEmployees ?? []"
            :key="emp.id"
            :to="`/employees/${emp.id}`"
            class="group flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3 transition-all hover:border-primary/20 hover:shadow-sm"
          >
            <div class="min-w-0">
              <p class="truncate text-sm font-medium group-hover:text-primary">{{ emp.name }}</p>
              <p class="truncate text-xs text-muted-foreground">{{ emp.description || "等待补充职责说明" }}</p>
            </div>
            <span class="shrink-0 text-xs text-muted-foreground">
              {{ emp.schedule?.nextRunAt ? formatDateTime(emp.schedule.nextRunAt) : "等待配置" }}
            </span>
          </NuxtLink>

          <div
            v-if="(data?.data.upcomingEmployees ?? []).length === 0"
            class="flex items-center gap-3 rounded-lg border border-dashed border-border p-4"
          >
            <Sparkles class="h-4 w-4 shrink-0 text-primary" :stroke-width="1.8" />
            <div>
              <p class="text-sm font-medium">还没有自动任务</p>
              <p class="text-xs text-muted-foreground">先在员工中心创建员工并配置自动任务。</p>
            </div>
          </div>
        </div>
      </section>

      <!-- Run Stats -->
      <section>
        <div class="mb-3">
          <span class="section-label">执行统计</span>
          <h2 class="mt-0.5 text-lg font-semibold">运行状态分布</h2>
        </div>
        <div class="grid grid-cols-3 gap-3">
          <div class="flex flex-col items-center justify-center rounded-xl border border-border bg-card px-3 py-5 text-center">
            <CheckCircle2 class="mb-2 h-5 w-5 text-primary" :stroke-width="1.8" />
            <p class="font-display text-2xl font-bold text-primary">{{ runsData?.data.total ?? '—' }}</p>
            <p class="mt-0.5 text-[11px] uppercase tracking-wide text-muted-foreground">总运行量</p>
          </div>
          <div class="flex flex-col items-center justify-center rounded-xl border border-border bg-card px-3 py-5 text-center">
            <Play class="mb-2 h-5 w-5 text-amber-500" :stroke-width="1.8" />
            <p class="font-display text-2xl font-bold text-amber-500">{{ data?.data.summary.scheduledEmployees ?? '—' }}</p>
            <p class="mt-0.5 text-[11px] uppercase tracking-wide text-muted-foreground">自动任务数</p>
          </div>
          <div class="flex flex-col items-center justify-center rounded-xl border border-border bg-card px-3 py-5 text-center">
            <AlertTriangle class="mb-2 h-5 w-5 text-destructive" :stroke-width="1.8" />
            <p class="font-display text-2xl font-bold text-destructive">{{ data?.data.summary.failedRuns ?? '—' }}</p>
            <p class="mt-0.5 text-[11px] uppercase tracking-wide text-muted-foreground">待处理失败</p>
          </div>
        </div>
      </section>
    </div>

    <!-- Full Runs Section -->
    <section>
      <div class="mb-4 flex items-center justify-between">
        <div>
          <span class="section-label">执行追踪</span>
          <h2 class="mt-0.5 text-lg font-semibold">全部运行记录</h2>
        </div>
        <span class="text-xs text-muted-foreground">共 {{ runsTotal }} 条记录</span>
      </div>

      <!-- Status Filters -->
      <div class="mb-4 flex flex-wrap items-center gap-2">
        <button
          class="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-all"
          :class="runsStatusFilter === null ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'"
          @click="setRunsFilter(null)"
        >
          全部
        </button>
        <button
          class="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-all"
          :class="runsStatusFilter === 'teal' ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'"
          @click="setRunsFilter(runsStatusFilter === 'teal' ? null : 'teal')"
        >
          <CheckCircle2 class="h-3.5 w-3.5" :stroke-width="2" />
          已完成
        </button>
        <button
          class="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-all"
          :class="runsStatusFilter === 'amber' ? 'bg-amber-400 text-white shadow-sm' : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'"
          @click="setRunsFilter(runsStatusFilter === 'amber' ? null : 'amber')"
        >
          <Play class="h-3.5 w-3.5" :stroke-width="2" />
          执行中
        </button>
        <button
          class="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-all"
          :class="runsStatusFilter === 'danger' ? 'bg-destructive text-destructive-foreground shadow-sm' : 'bg-destructive/10 text-destructive hover:bg-destructive/20'"
          @click="setRunsFilter(runsStatusFilter === 'danger' ? null : 'danger')"
        >
          <AlertTriangle class="h-3.5 w-3.5" :stroke-width="2" />
          失败
        </button>
      </div>

      <!-- Loading State -->
      <div v-if="runsPending" class="flex flex-col items-center py-12 text-center">
        <div class="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <p class="mt-3 text-sm text-muted-foreground">加载运行记录...</p>
      </div>

      <!-- Table -->
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
        v-else-if="!runsPending"
        class="flex flex-col items-center rounded-2xl border border-dashed border-border bg-muted/10 px-6 py-12 text-center"
      >
        <div class="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/5">
          <Sparkles class="h-7 w-7 text-primary/30" :stroke-width="1.5" />
        </div>
        <p class="font-medium">{{ runsStatusFilter !== null ? '没有符合条件的记录' : '还没有运行记录' }}</p>
        <p class="mt-1 max-w-xs text-sm text-muted-foreground">员工开始自动运行或收到聊天指令后，记录会在这里集中展示。</p>
      </div>

      <!-- Pagination -->
      <div v-if="!runsPending && totalRunPages > 1" class="flex items-center justify-center gap-2 pt-4">
        <button
          class="flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium transition-all"
          :class="runsPage <= 1 ? 'opacity-40 cursor-not-allowed bg-muted/30 text-muted-foreground' : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'"
          :disabled="runsPage <= 1"
          @click="goToRunsPage(runsPage - 1)"
        >
          <ChevronLeft class="h-4 w-4" :stroke-width="2" />
          上一页
        </button>

        <div class="flex items-center gap-1">
          <template v-for="(p, i) in visibleRunPages" :key="i">
            <span v-if="p === '...'" class="flex h-8 w-6 items-center justify-center text-sm text-muted-foreground">…</span>
            <button
              v-else
              class="flex h-8 w-8 items-center justify-center rounded-lg text-sm font-medium transition-all"
              :class="p === runsPage ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'"
              @click="goToRunsPage(p as number)"
            >
              {{ p }}
            </button>
          </template>
        </div>

        <button
          class="flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium transition-all"
          :class="runsPage >= totalRunPages ? 'opacity-40 cursor-not-allowed bg-muted/30 text-muted-foreground' : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'"
          :disabled="runsPage >= totalRunPages"
          @click="goToRunsPage(runsPage + 1)"
        >
          下一页
          <ChevronRight class="h-4 w-4" :stroke-width="2" />
        </button>
      </div>
    </section>

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

            <div class="space-y-5 p-6">
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
                    <div v-if="event.payload && Object.keys(event.payload).length > 0" class="ml-9 mt-1.5">
                      <pre class="max-h-32 overflow-auto rounded bg-background/50 p-2 text-[11px] leading-relaxed text-muted-foreground">{{ JSON.stringify(event.payload, null, 2) }}</pre>
                    </div>
                  </div>
                  <p v-if="selectedRun.data.events.length === 0" class="text-sm text-muted-foreground">暂无事件记录。</p>
                </div>
              </div>

              <!-- Raw Result -->
              <details class="rounded-lg border border-border">
                <summary class="cursor-pointer px-4 py-3 text-sm font-medium transition-colors hover:bg-muted/30">查看原始结果</summary>
                <pre class="overflow-auto border-t border-border bg-muted/20 px-4 py-3 font-mono text-xs leading-relaxed">{{ JSON.stringify(selectedRun.data.result, null, 2) }}</pre>
              </details>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>
