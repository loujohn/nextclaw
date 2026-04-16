<script setup lang="ts">
const route = useRoute();
const router = useRouter();
const employeeId = computed(() => String(route.params.id));
const { data, refresh: refreshEmployeeDetail } = useEmployeeDetail(employeeId);
const isOverviewTab = computed(() => route.path === `/employees/${employeeId.value}`);
const overviewRefreshVersion = ref(0);
const employeeCenterLink = computed(() => ({
  path: "/employees",
  query: route.query
}));

const deptsStore = useDepartmentsStore();
const skillsStore = useSkillsStore();

const deptName = computed(() => {
  const deptId = data.value?.data?.departmentId;
  if (!deptId) return null;
  return deptsStore.nameMap.get(deptId) ?? null;
});
const deptLink = computed(() => {
  const deptId = data.value?.data?.departmentId;
  if (!deptId) return null;
  return { path: "/employees", query: { view: "list", deptId } };
});

const skillNameZhMap = computed(() => skillsStore.displayNameMap);

import type { DashboardStatsPayload } from "~~/shared/api-types";

const { data: dashStatsPayload, refresh: refreshDashboardStats } = useLazyFetch<DashboardStatsPayload>("/api/dashboard/stats");

const employeeStats = computed(() => {
  const stats = dashStatsPayload.value?.data.employeeStats ?? [];
  return stats.find((s) => s.employeeId === employeeId.value) ?? { todayRunCount: 0, totalRunCount: 0, todaySuccessRate: 100 };
});

import type { JobsPayload } from "~~/shared/api-types";

const { data: jobsPayload, refresh: refreshJobs } = useLazyFetch<JobsPayload>(
  () => `/api/employees/${employeeId.value}/jobs`
);
const jobs = computed(() => jobsPayload.value?.data ?? []);

const nextJobRun = computed(() => {
  const enabledJobs = jobs.value.filter((j) => j.enabled && j.nextRunAt);
  if (enabledJobs.length === 0) return null;
  enabledJobs.sort((a, b) => new Date(a.nextRunAt!).getTime() - new Date(b.nextRunAt!).getTime());
  const first = enabledJobs[0];
  if (!first?.nextRunAt) return null;
  return { name: first.name, nextRunAt: first.nextRunAt };
});

const tabs = computed(() => [
  { label: "概览", to: { path: `/employees/${employeeId.value}`, query: route.query } },
  { label: "聊天", to: { path: `/employees/${employeeId.value}/chat`, query: route.query } },
  { label: "定时任务", to: { path: `/employees/${employeeId.value}/jobs`, query: route.query } },
  { label: "运行记录", to: { path: `/employees/${employeeId.value}/runs`, query: route.query } },
  { label: "配置", to: { path: `/employees/${employeeId.value}/config`, query: route.query } }
]);

function isTabActive(path: string): boolean {
  return route.path === path;
}

watch(isOverviewTab, (active, previousActive) => {
  if (!active || previousActive === undefined || previousActive) return;
  overviewRefreshVersion.value += 1;
  void Promise.all([
    refreshEmployeeDetail(),
    refreshDashboardStats(),
    refreshJobs(),
  ]);
});
</script>

<template>
  <PageSkeleton v-if="!data?.data" />
  <div class="mx-auto max-w-6xl space-y-6 p-6 lg:p-8" v-else>
    <Breadcrumb :items="[
      { label: '组织架构', to: employeeCenterLink },
      ...(deptName ? [{ label: deptName, to: deptLink ?? undefined }] : []),
      { label: data.data.name }
    ]" />

    <!-- Hero -->
    <header class="hero-section grid gap-6 lg:grid-cols-[1fr_auto]">
      <div class="relative space-y-2">
        <span class="section-label">员工工作台</span>
        <h1 class="font-display text-2xl font-bold tracking-tight lg:text-3xl">{{ data.data.name }}</h1>
        <p class="max-w-xl text-sm leading-relaxed text-muted-foreground">
          {{ data.data.description || "这个员工已经可以开始处理对话、自动任务和业务结果。" }}
        </p>
      </div>
      <div class="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div class="space-y-1">
          <p class="text-[11px] uppercase tracking-wider text-muted-foreground">编码</p>
          <p class="font-mono text-sm font-semibold">{{ data.data.code }}</p>
        </div>
        <div class="space-y-1">
          <p class="text-[11px] uppercase tracking-wider text-muted-foreground">技能</p>
          <p class="text-sm font-semibold">{{ data.data.skills.length }}</p>
        </div>
        <div class="space-y-1">
          <p class="text-[11px] uppercase tracking-wider text-muted-foreground">任务调度</p>
          <p class="text-sm font-semibold">{{ data.data.automationSummary.countLabel }}</p>
        </div>
        <div class="space-y-1">
          <p class="text-[11px] uppercase tracking-wider text-muted-foreground">自动化状态</p>
          <p
            class="text-sm font-semibold"
            :class="{
              'text-primary': data.data.automationSummary.tone === 'teal',
              'text-warning': data.data.automationSummary.tone === 'amber',
              'text-destructive': data.data.automationSummary.tone === 'danger',
              'text-muted-foreground': data.data.automationSummary.tone === 'slate'
            }"
          >{{ data.data.automationSummary.statusLabel }}</p>
        </div>
      </div>
    </header>

    <!-- Tabs -->
    <nav class="flex gap-2">
      <NuxtLink
        v-for="tab in tabs"
        :key="tab.to.path"
        :to="tab.to"
        class="rounded-full px-4 py-2 text-sm font-medium transition-colors"
        :class="isTabActive(tab.to.path)
          ? 'bg-primary text-primary-foreground'
          : 'border border-border bg-card text-muted-foreground hover:text-foreground'"
      >
        {{ tab.label }}
      </NuxtLink>
    </nav>

    <!-- Overview Tab Content -->
    <div v-if="isOverviewTab" class="space-y-4">
      <!-- Layer 1: Stats -->
      <EmployeeOverviewStatsRow
        :today-run-count="employeeStats.todayRunCount"
        :total-run-count="employeeStats.totalRunCount"
        :success-rate="employeeStats.todaySuccessRate"
      />

      <!-- Layer 2: Main Grid -->
      <div class="grid gap-4" style="grid-template-columns: 340px 1fr;">
        <EmployeeOverviewProfileCard
          :employee="data.data"
          :dept-name="deptName"
          :skill-display-names="skillNameZhMap"
          :next-job-run="nextJobRun"
          @skill-upgraded="refreshEmployeeDetail()"
        />
        <EmployeeOverviewRecentActivity
          :refresh-version="overviewRefreshVersion"
          :employee-id="employeeId"
          @click-run="() => router.push({ path: `/employees/${employeeId}/runs`, query: route.query })"
        />
      </div>

      <!-- Layer 3: Jobs Strip -->
      <EmployeeOverviewJobsStrip
        v-if="jobs.length > 0"
        :jobs="jobs"
        @go-to-jobs="router.push({ path: `/employees/${employeeId}/jobs`, query: route.query })"
      />
    </div>

    <!-- Non-overview tab content -->
    <section v-else>
      <NuxtPage />
    </section>
  </div>
</template>
