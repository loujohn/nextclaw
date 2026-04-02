# 员工概览页重构 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 重写员工详情页的概览 Tab，从简陋的 2 行布局升级为 3 层信息架构（统计卡片 + 双栏主区 + 定时任务概览），视觉风格与新 Dashboard 一致。

**Architecture:** 概览 Tab 内容区完全重写，复用现有 API（`/api/dashboard/stats`、`/api/employees/[id]`、`/api/employees/[id]/jobs`），新增 4 个 Vue 组件放在 `app/components/employee-overview/` 目录下。Hero 区和 Tab 导航保持不变。

**Tech Stack:** Vue 3 + Nuxt 3 + TypeScript + Tailwind CSS

---

## Chunk 1: 前端组件与页面重写

### Task 1: 创建 StatsRow 组件

**Files:**
- Create: `packages/nextclaw-digital-employee/app/components/employee-overview/StatsRow.vue`

- [ ] **Step 1: 创建 StatsRow.vue**

```vue
<script setup lang="ts">
defineProps<{
  todayRunCount: number;
  totalRunCount: number;
  successRate: number;
}>();
</script>

<template>
  <section class="grid grid-cols-3 gap-3.5">
    <!-- 今日运行 -->
    <article class="rounded-2xl border border-border bg-card px-5 py-[18px] transition-all duration-200 hover:shadow-[0_6px_20px_rgba(0,0,0,0.05)] hover:-translate-y-[1px]">
      <div class="mb-3 flex h-9 w-9 items-center justify-center rounded-[10px] bg-muted/60 text-base">✅</div>
      <p class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-[3px]">今日运行</p>
      <p class="text-[32px] font-extrabold tracking-tight leading-tight">
        {{ todayRunCount }}
        <span class="text-[13px] font-medium text-muted-foreground ml-[3px]">次</span>
      </p>
      <div class="mt-2.5 h-[3px] w-full overflow-hidden rounded-full bg-border/40">
        <div class="h-full rounded-full bg-[#10b981] transition-all duration-700 ease-out" :style="{ width: Math.min(todayRunCount * 10, 100) + '%' }" />
      </div>
    </article>

    <!-- 累计运行 -->
    <article class="rounded-2xl border border-border bg-card px-5 py-[18px] transition-all duration-200 hover:shadow-[0_6px_20px_rgba(0,0,0,0.05)] hover:-translate-y-[1px]">
      <div class="mb-3 flex h-9 w-9 items-center justify-center rounded-[10px] bg-muted/60 text-base">📊</div>
      <p class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-[3px]">累计运行</p>
      <p class="text-[32px] font-extrabold tracking-tight leading-tight">
        {{ totalRunCount }}
        <span class="text-[13px] font-medium text-muted-foreground ml-[3px]">次</span>
      </p>
      <div class="mt-2.5 h-[3px] w-full overflow-hidden rounded-full bg-border/40">
        <div class="h-full rounded-full bg-[#3b82f6] transition-all duration-700 ease-out" :style="{ width: Math.min(totalRunCount / 5, 100) + '%' }" />
      </div>
    </article>

    <!-- 成功率 -->
    <article class="rounded-2xl border border-border bg-card px-5 py-[18px] transition-all duration-200 hover:shadow-[0_6px_20px_rgba(0,0,0,0.05)] hover:-translate-y-[1px]">
      <div class="mb-3 flex h-9 w-9 items-center justify-center rounded-[10px] bg-muted/60 text-base">🎯</div>
      <p class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-[3px]">成功率</p>
      <p class="text-[32px] font-extrabold tracking-tight leading-tight">
        {{ successRate }}
        <span class="text-[13px] font-medium text-muted-foreground ml-[3px]">%</span>
      </p>
      <div class="mt-2.5 h-[3px] w-full overflow-hidden rounded-full bg-border/40">
        <div class="h-full rounded-full bg-[#10b981] transition-all duration-700 ease-out" :style="{ width: successRate + '%' }" />
      </div>
    </article>
  </section>
</template>
```

### Task 2: 创建 ProfileCard 组件

**Files:**
- Create: `packages/nextclaw-digital-employee/app/components/employee-overview/ProfileCard.vue`

- [ ] **Step 1: 创建 ProfileCard.vue**

左栏员工信息卡，包含头像、状态、健康检查、技能列表、下次运行信息。

Props:
- `employee`: 从 `useEmployeeDetail` 返回的 data
- `deptName: string | null`
- `skillDisplayNames: Map<string, string>`（技能中文名映射）
- `nextJobRun: { name: string; nextRunAt: string } | null`

内部逻辑：
- 渐变头像使用 `AVATAR_GRADIENTS` 数组（与 Dashboard EmployeeCard 一致）
- 健康检查项：hasPrompt / hasSkills / automationSummary
- 技能标签：`rounded-md bg-[#eef2ff] px-2.5 py-[3px] text-[11px] font-medium text-[#6366f1]`
- 下次运行信息：底部信息条

### Task 3: 创建 RecentActivity 组件

**Files:**
- Create: `packages/nextclaw-digital-employee/app/components/employee-overview/RecentActivity.vue`

- [ ] **Step 1: 创建 RecentActivity.vue**

右栏运行活动列表，复用 Dashboard OutputFeed 的样式，包含分页。

Props:
- `runs: Array<{ id: string; status: string; summary: string; startedAt: string; finishedAt?: string | null; skillDisplayName?: string }>`

Events:
- `clickRun(id: string)`

内部逻辑：
- 每页 5 条
- 状态圆点颜色：completed → 绿色，running → 蓝色，failed → 黄色
- `timeAgo()` 相对时间
- 分页控件 `‹ 1/N ›`

### Task 4: 创建 JobsStrip 组件

**Files:**
- Create: `packages/nextclaw-digital-employee/app/components/employee-overview/JobsStrip.vue`

- [ ] **Step 1: 创建 JobsStrip.vue**

定时任务概览条，水平卡片列表。

Props:
- `jobs: Array<{ id: string; name: string; scheduleKind: string; cronExpr: string | null; everyMs: number | null; enabled: boolean; nextRunAt: string | null }>`

Events:
- `goToJobs()`

内部逻辑：
- `grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))]`
- 每张卡片：图标 + 任务名 + 启用/停用标签 + 调度说明 + 下次运行
- 调度说明复用 `shared/cron-utils.ts` 的 `cronHumanLabel()` / `everyMsHumanLabel()`

### Task 5: 重写 `[id].vue` 概览 Tab 区域

**Files:**
- Modify: `packages/nextclaw-digital-employee/app/pages/employees/[id].vue`

- [ ] **Step 1: 新增数据获取**

在现有 `<script setup>` 中新增：

```typescript
// Dashboard stats for this employee
type DashboardStatsPayload = {
  ok: boolean;
  data: {
    employeeStats: Array<{
      employeeId: string;
      todayRunCount: number;
      totalRunCount: number;
      todaySuccessRate: number;
    }>;
  };
};

const { data: dashStatsPayload } = await useFetch<DashboardStatsPayload>("/api/dashboard/stats");

const employeeStats = computed(() => {
  const stats = dashStatsPayload.value?.data.employeeStats ?? [];
  return stats.find((s) => s.employeeId === employeeId.value) ?? { todayRunCount: 0, totalRunCount: 0, todaySuccessRate: 100 };
});

// Schedule jobs
type ScheduleJob = {
  id: string;
  name: string;
  scheduleKind: string;
  cronExpr: string | null;
  everyMs: number | null;
  enabled: boolean;
  nextRunAt: string | null;
};
const { data: jobsPayload } = await useFetch<{ ok: boolean; data: ScheduleJob[] }>(
  () => `/api/employees/${employeeId.value}/jobs`
);
const jobs = computed(() => jobsPayload.value?.data ?? []);

const nextJobRun = computed(() => {
  const enabledJobs = jobs.value.filter((j) => j.enabled && j.nextRunAt);
  if (enabledJobs.length === 0) return null;
  enabledJobs.sort((a, b) => new Date(a.nextRunAt!).getTime() - new Date(b.nextRunAt!).getTime());
  return { name: enabledJobs[0].name, nextRunAt: enabledJobs[0].nextRunAt! };
});
```

- [ ] **Step 2: 重写概览 Tab template**

将 `<div v-if="isOverviewTab" class="space-y-4">` 内容完全替换为：

```html
<div v-if="isOverviewTab" class="space-y-4">
  <!-- Layer 1: Stats -->
  <EmployeeOverviewStatsRow
    :today-run-count="employeeStats.todayRunCount"
    :total-run-count="employeeStats.totalRunCount"
    :success-rate="employeeStats.todaySuccessRate"
  />

  <!-- Layer 2: Main Grid -->
  <div class="grid gap-4" style="grid-template-columns: 320px 1fr;">
    <EmployeeOverviewProfileCard
      v-if="data?.data"
      :employee="data.data"
      :dept-name="deptName"
      :skill-display-names="skillNameZhMap"
      :next-job-run="nextJobRun"
    />
    <EmployeeOverviewRecentActivity
      v-if="data?.data"
      :runs="data.data.recentRuns.map((r) => ({
        id: r.id,
        status: r.status,
        summary: r.summary,
        startedAt: r.startedAt,
        finishedAt: r.finishedAt ?? null,
      }))"
      @click-run="(id) => $router.push(`/runs?runId=${id}`)"
    />
  </div>

  <!-- Layer 3: Jobs Strip -->
  <EmployeeOverviewJobsStrip
    v-if="jobs.length > 0"
    :jobs="jobs"
    @go-to-jobs="$router.push({ path: `/employees/${employeeId}/jobs`, query: route.query })"
  />
</div>
```

- [ ] **Step 3: 删除旧的概览区域代码**

删除以下旧代码（Row 1: 状态检查 + 最近运行，Row 2: 已绑定技能 + 角色定义），以及不再需要的 import（`CircleCheck`、`CircleAlert`、`MessageSquare`）。

### Task 6: 验证

- [ ] **Step 1: 构建验证**

```bash
cd packages/nextclaw-digital-employee && pnpm build
```

Expected: 无错误

- [ ] **Step 2: 冒烟验证**

启动 dev server，访问 `/employees/[某个员工ID]`，确认：
1. 3 张统计卡片正确显示数据
2. 左栏员工信息卡内容完整
3. 右栏运行活动列表分页正常
4. 定时任务概览条显示正确
5. Tab 切换不受影响
