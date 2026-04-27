<script setup lang="ts">
import { Sparkles, ChevronLeft, ChevronRight, CheckCircle2, AlertTriangle, Clock, CalendarClock } from "lucide-vue-next";

const route = useRoute();
const employeeId = computed(() => String(route.params.id));

type RunItem = {
  id: string;
  createdByUserLabel: string;
  statusLabel: string;
  triggerLabel: string;
  scheduleJobName: string | null;
  summary: string;
  highlight: string;
  tone: "teal" | "amber" | "slate" | "danger";
  startedAtLabel: string;
};

type JobOption = { id: string; name: string };

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

type RunListPayload = {
  ok: boolean;
  data: {
    items: RunItem[];
    total: number;
    page: number;
    pageSize: number;
  };
};

type JobListPayload = { ok: boolean; data: JobOption[] };

const PAGE_SIZE = 10;
const currentPage = ref(1);
const jobFilter = ref<string | null>(null);

const { data: jobPayload } = useLazyFetch<JobListPayload>(
  () => `/api/employees/${employeeId.value}/jobs`,
  { key: computed(() => `employee-jobs:${employeeId.value}`) }
);
const jobOptions = computed(() => jobPayload.value?.data ?? []);

function buildApiUrl() {
  const params = new URLSearchParams({ page: String(currentPage.value), pageSize: String(PAGE_SIZE) });
  if (jobFilter.value) params.set("jobId", jobFilter.value);
  return `/api/employees/${employeeId.value}/runs?${params.toString()}`;
}

const { data, pending } = useLazyFetch<RunListPayload>(() => buildApiUrl(), {
  key: computed(() => `employee-runs:${employeeId.value}:history:${currentPage.value}:${jobFilter.value ?? "all"}`)
});

const runs = computed(() => data.value?.data.items ?? []);
const total = computed(() => data.value?.data.total ?? 0);
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / PAGE_SIZE)));

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

const selectedRunId = ref("");
const selectedRun = ref<RunDetailPayload | null>(null);
const loadingDetail = ref(false);

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

function goToPage(page: number) {
  if (page < 1 || page > totalPages.value) return;
  currentPage.value = page;
}

function setJobFilter(jobId: string | null) {
  jobFilter.value = jobId;
  currentPage.value = 1;
}
</script>

<template>
  <div class="space-y-4">

    <!-- 定时任务筛选 -->
    <div v-if="jobOptions.length > 0" class="flex flex-wrap items-center gap-2">
      <CalendarClock class="h-3.5 w-3.5 shrink-0 text-muted-foreground" :stroke-width="1.8" />
      <button
        class="rounded-full px-3 py-1 text-xs font-medium transition-all"
        :class="jobFilter === null ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'"
        @click="setJobFilter(null)"
      >
        全部来源
      </button>
      <button
        v-for="job in jobOptions"
        :key="job.id"
        class="rounded-full px-3 py-1 text-xs font-medium transition-all"
        :class="jobFilter === job.id ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'"
        @click="setJobFilter(jobFilter === job.id ? null : job.id)"
      >
        {{ job.name }}
      </button>
    </div>

    <div v-if="pending" class="flex flex-col items-center py-12 text-center">
      <div class="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      <p class="mt-3 text-sm text-muted-foreground">加载中...</p>
    </div>

    <div v-else-if="runs.length > 0" class="overflow-x-auto rounded-xl border border-border">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-border bg-muted/40 text-xs text-muted-foreground">
            <th class="px-4 py-3 text-left font-medium">状态</th>
            <th class="px-4 py-3 text-left font-medium">发起人</th>
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
                <span class="rounded-full px-2 py-0.5 text-[11px] font-semibold" :class="badgeClass[run.tone]">
                  {{ run.statusLabel }}
                </span>
              </div>
            </td>
            <td class="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
              <span class="inline-flex items-center rounded-full bg-muted px-2 py-0.5 font-medium text-foreground/80">
                {{ run.createdByUserLabel }}
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

    <div v-else class="flex items-center gap-3 rounded-lg border border-dashed border-border p-4">
      <Sparkles class="h-4 w-4 shrink-0 text-primary" :stroke-width="1.8" />
      <div>
        <p class="text-sm font-medium">{{ jobFilter ? '该定时任务暂无运行记录' : '还没有运行历史' }}</p>
        <p class="text-xs text-muted-foreground">先通过聊天或自动任务触发一次执行。</p>
      </div>
    </div>

    <div v-if="!pending && totalPages > 1" class="flex items-center justify-center gap-2">
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
  </div>

  <RunDetailSlideOver :run="selectedRun?.data ?? null" :loading="loadingDetail" @close="closeDetail" />
</template>
