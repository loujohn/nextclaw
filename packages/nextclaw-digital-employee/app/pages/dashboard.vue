<script setup lang="ts">
import { Bot, CheckCircle2, BarChart3, Zap } from "lucide-vue-next";
import type { Component } from "vue";
import type { EmployeeListPayload } from "~/composables/useEmployeeList";

type DashboardStatsPayload = {
  ok: boolean;
  data: {
    todayRunCount: number;
    todaySuccessRate: number;
    totalSkillCount: number;
    employeeStats: Array<{
      employeeId: string;
      todayRunCount: number;
      totalRunCount: number;
      todaySuccessRate: number;
    }>;
    skillCategoryCounts: Array<{
      category: string;
      categoryLabel: string;
      emoji: string;
      count: number;
    }>;
  };
};

type IntegrationItem = {
  id: string;
  title: string;
  statusLabel: string;
  description: string;
  detail: string;
  actionLabel: string;
  tone: "teal" | "amber" | "slate";
};

type RunListPayload = {
  ok: boolean;
  data: {
    items: Array<{
      id: string;
      employeeId: string | null;
      employeeName: string;
      statusLabel: string;
      triggerLabel: string;
      scheduleJobName: string | null;
      summary: string;
      highlight: string;
      tone: "teal" | "amber" | "slate" | "danger";
      startedAtLabel: string;
    }>;
    total: number;
    page: number;
    pageSize: number;
  };
};

type SkillOption = {
  name: string;
  nameZh?: string;
  statusLabel: string;
  usageCount: number;
  enabled: boolean;
  purpose: string;
  categoryLabel: string;
};

type RunDetail = {
  employeeName: string;
  statusLabel: string;
  triggerLabel: string;
  scheduleJobName: string | null;
  summary: string;
  result: Record<string, unknown>;
  events: Array<{ id: string; seq: number; eventType: string; payload: Record<string, unknown>; createdAt: string }>;
};

const router = useRouter();

const { data: statsPayload, refresh: refreshStats } = await useFetch<DashboardStatsPayload>("/api/dashboard/stats");
const { data: employeePayload, refresh: refreshEmployees } = await useFetch<EmployeeListPayload>("/api/employees");
const { data: runsPayload, refresh: refreshRuns } = await useFetch<RunListPayload>("/api/runs?page=1&pageSize=10");
const { data: integrationPayload, refresh: refreshIntegrations } = await useFetch<{ ok: boolean; data: IntegrationItem[] }>("/api/integrations");
const { data: skillPayload } = await useFetch<{ ok: boolean; data: SkillOption[] }>("/api/skills");
const { data: departmentPayload } = await useFetch<{ ok: boolean; data: Array<{ id: string; name: string }> }>("/api/departments");

const stats = computed(() => statsPayload.value?.data);
const employees = computed(() => employeePayload.value?.data ?? []);

const deptNameMap = computed(() => new Map((departmentPayload.value?.data ?? []).map((d) => [d.id, d.name])));

const employeeStatsMap = computed(() => {
  const m = new Map<string, { todayRunCount: number; totalRunCount: number; todaySuccessRate: number }>();
  for (const s of stats.value?.employeeStats ?? []) {
    m.set(s.employeeId, s);
  }
  return m;
});

const skillDisplayNames = computed(() => {
  const m = new Map<string, string>();
  for (const skill of skillPayload.value?.data ?? []) {
    m.set(skill.name, skill.nameZh ?? skill.name);
  }
  return m;
});

const currentEmployeeIndex = ref(0);

const currentEmployee = computed(() => {
  const list = employees.value;
  if (list.length === 0) return null;
  return list[currentEmployeeIndex.value % list.length];
});

const hasMultipleEmployees = computed(() => employees.value.length > 1);

function switchEmployee(delta: number) {
  const len = employees.value.length;
  if (len <= 1) return;
  currentEmployeeIndex.value = ((currentEmployeeIndex.value + delta) % len + len) % len;
}

const recentRuns = computed(() => {
  return (runsPayload.value?.data.items ?? []).map((r) => ({
    id: r.id,
    employeeId: r.employeeId,
    employeeName: r.employeeName,
    skillDisplayName: r.highlight || r.summary,
    status: r.tone === "teal" ? "succeeded" : r.tone === "amber" ? "running" : r.tone === "danger" ? "failed" : "queued",
    summary: r.summary,
    startedAt: r.startedAtLabel,
    finishedAt: r.startedAtLabel,
  }));
});

const integrations = computed(() => {
  const apiItems = (integrationPayload.value?.data ?? []).map((item) => ({
    name: item.title,
    type: item.id,
    isEnabled: item.tone === "teal",
  }));
  return [
    ...apiItems,
    { name: "政务公司知识库", type: "knowledge-base", isEnabled: true },
    { name: "代码仓库", type: "git-repo", isEnabled: true },
  ];
});

const statCards = computed<Array<{
  icon: Component;
  iconColor: string;
  label: string;
  value: number;
  unit: string;
  barPercent: number;
  barColor: string;
}>>(() => {
  const s = stats.value;
  if (!s) return [];
  return [
    { icon: Bot, iconColor: "bg-indigo-50 ring-indigo-200/50 text-indigo-500", label: "数字员工", value: employees.value.length, unit: "在岗", barPercent: 100, barColor: "bg-indigo-500" },
    { icon: CheckCircle2, iconColor: "bg-emerald-50 ring-emerald-200/50 text-emerald-500", label: "今日任务", value: s.todayRunCount, unit: "次", barPercent: Math.min(s.todayRunCount * 10, 100), barColor: "bg-emerald-500" },
    { icon: BarChart3, iconColor: "bg-emerald-50 ring-emerald-200/50 text-emerald-500", label: "执行成功率", value: s.todaySuccessRate, unit: "%", barPercent: s.todaySuccessRate, barColor: "bg-emerald-500" },
    { icon: Zap, iconColor: "bg-blue-50 ring-blue-200/50 text-blue-500", label: "平台技能", value: s.totalSkillCount, unit: "个", barPercent: Math.min(s.totalSkillCount * 5, 100), barColor: "bg-blue-500" },
  ];
});

function getEmployeeStats(id: string) {
  return employeeStatsMap.value.get(id) ?? { todayRunCount: 0, totalRunCount: 0, todaySuccessRate: 100 };
}

function goToEmployee(id: string) {
  router.push(`/employees/${id}`);
}

const selectedRunDetail = ref<RunDetail | null>(null);
const loadingRunDetail = ref(false);

async function openRunDetail(runId: string) {
  loadingRunDetail.value = true;
  try {
    const payload = await $fetch<{ ok: boolean; data: RunDetail }>(`/api/runs/${runId}`);
    selectedRunDetail.value = payload.data;
  } finally {
    loadingRunDetail.value = false;
  }
}

function closeRunDetail() {
  selectedRunDetail.value = null;
}

function goToRun(id: string) {
  openRunDetail(id);
}

function goToSkillCategory(slug: string) {
  router.push(`/skills?category=${slug}`);
}

let refreshInterval: ReturnType<typeof setInterval>;

onMounted(() => {
  refreshInterval = setInterval(() => {
    refreshStats();
    refreshEmployees();
    refreshRuns();
    refreshIntegrations();
  }, 30_000);
});

onUnmounted(() => {
  clearInterval(refreshInterval);
});

const pending = computed(() => !statsPayload.value && !employeePayload.value);
</script>

<template>
  <PageSkeleton v-if="pending" />
  <div v-else class="mx-auto max-w-6xl p-7 lg:p-9 space-y-5">
    <!-- Layer 1: Header -->
    <header class="relative">
      <span class="inline-block text-[11px] font-bold uppercase tracking-wider text-primary bg-primary/8 px-2.5 py-[3px] rounded-md mb-2">
        工作中心
      </span>
      <h1 class="text-[28px] font-extrabold tracking-tight bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">平台运行全景</h1>
      <p class="text-[13px] text-muted-foreground/80 leading-relaxed mt-1.5 max-w-xl">
        汇聚数字员工运行态势、工作成果与系统能力，一屏掌控全局。
      </p>
    </header>

    <!-- Layer 2: Stats Row -->
    <section class="grid grid-cols-4 gap-3.5">
      <DashboardStatsCard
        v-for="card in statCards"
        :key="card.label"
        :icon="card.icon"
        :icon-color="card.iconColor"
        :label="card.label"
        :value="card.value"
        :unit="card.unit"
        :bar-percent="card.barPercent"
        :bar-color="card.barColor"
      />
    </section>

    <!-- Layer 3: Main Grid (320px + 1fr) -->
    <div class="grid gap-4" style="grid-template-columns: 320px 1fr;">
      <!-- Left: Single Employee Section Card -->
      <div class="rounded-2xl border border-border/60 bg-card overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
        <div class="flex items-center justify-between px-[18px] py-3.5 border-b border-border/60">
          <h3 class="text-sm font-bold">数字员工</h3>
          <div class="flex items-center gap-2">
            <template v-if="hasMultipleEmployees">
              <button
                class="flex h-5 w-5 items-center justify-center rounded text-xs text-muted-foreground hover:bg-muted transition-colors"
                @click="switchEmployee(-1)"
              >‹</button>
              <span class="text-[10px] font-semibold text-muted-foreground">
                {{ currentEmployeeIndex + 1 }}/{{ employees.length }}
              </span>
              <button
                class="flex h-5 w-5 items-center justify-center rounded text-xs text-muted-foreground hover:bg-muted transition-colors"
                @click="switchEmployee(1)"
              >›</button>
            </template>
            <span class="text-[10px] font-semibold text-primary bg-primary/10 px-2 py-[2px] rounded-md">
              {{ employees.length }} 名在岗
            </span>
          </div>
        </div>
        <div class="p-[18px]">
          <DashboardEmployeeCard
            v-if="currentEmployee"
            :key="currentEmployee.id"
            :employee="currentEmployee"
            :dept-name="currentEmployee.departmentId ? deptNameMap.get(currentEmployee.departmentId) ?? null : null"
            :stats="getEmployeeStats(currentEmployee.id)"
            :skill-display-names="skillDisplayNames"
            @click="goToEmployee(currentEmployee.id)"
          />
          <div v-else class="flex flex-col items-center py-6">
            <p class="text-xs text-muted-foreground mb-3">还没有数字员工</p>
            <NuxtLink
              to="/employees?action=create"
              class="flex items-center gap-2 rounded-[10px] border border-dashed border-border px-4 py-2.5 text-[13px] font-medium text-muted-foreground/70 transition-all hover:border-primary hover:text-primary hover:bg-primary/5"
            >
              <span class="text-lg opacity-50">+</span>
              创建数字员工
            </NuxtLink>
          </div>
        </div>
      </div>

      <!-- Right: Output Feed Section Card -->
      <div class="rounded-2xl border border-border/60 bg-card overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
        <div class="flex items-center justify-between px-[18px] py-3.5 border-b border-border/60">
          <h3 class="text-sm font-bold">最新工作成果</h3>
          <span class="flex items-center gap-1.5 text-[10px] font-semibold text-primary bg-primary/8 px-2 py-[2px] rounded-md">
            <span class="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
            实时更新
          </span>
        </div>
        <div class="px-[18px] py-3.5">
          <DashboardOutputFeed
            :runs="recentRuns"
            @click-run="goToRun"
          />
        </div>
      </div>
    </div>

    <!-- Layer 4a: Skill Capability Map -->
    <DashboardSkillMap
      v-if="stats"
      :categories="stats.skillCategoryCounts"
      :total-skill-count="stats.totalSkillCount"
      @click-category="goToSkillCategory"
    />

    <!-- Layer 4b: Integration Strip -->
    <DashboardIntegrationStrip :integrations="integrations" />
  </div>

  <RunDetailSlideOver :run="selectedRunDetail" :loading="loadingRunDetail" @close="closeRunDetail" />
</template>
