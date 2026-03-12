<script setup lang="ts">
import { formatDateTime } from "~~/shared/ui-models";

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
    recentRuns: Array<{
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

const { data } = await useFetch<DashboardPayload>("/api/dashboard");

const summaryCards = computed(() => {
  const summary = data.value?.data.summary;
  if (!summary) {
    return [];
  }
  return [
    { label: "员工总数", value: summary.totalEmployees, tone: "teal" as const, icon: "employees" as const },
    { label: "自动运行", value: summary.scheduledEmployees, tone: "amber" as const, icon: "clock" as const },
    { label: "失败待处理", value: summary.failedRuns, tone: "rose" as const, icon: "warning" as const },
    { label: "已启用技能", value: summary.enabledSkills, tone: "slate" as const, icon: "spark" as const }
  ];
});
</script>

<template>
  <main class="app-shell">
    <AppNav />
    <section class="page-panel dashboard-shell">
      <section class="hero-panel dashboard-hero">
        <div class="hero-content">
          <p class="eyebrow">Daily Command Center</p>
          <h1>今天有哪些员工会自动开工，哪些结果需要你处理</h1>
          <p class="hero-copy">
            首页聚焦数字员工的运行态势、异常处理和最新产出，不再只是一个入口索引页。
          </p>
          <div class="hero-actions">
            <NuxtLink v-for="action in data?.data.quickActions ?? []" :key="action.id" class="primary-link" :to="action.to">
              {{ action.label }}
            </NuxtLink>
          </div>
        </div>

        <div class="summary-grid">
          <article
            v-for="card in summaryCards"
            :key="card.label"
            class="summary-card"
            :data-tone="card.tone"
          >
            <div class="summary-card-icon">
              <AppIcon :name="card.icon" :size="18" />
            </div>
            <span class="metric-label">{{ card.label }}</span>
            <strong>{{ card.value }}</strong>
          </article>
        </div>
      </section>

      <section class="alert-grid">
        <article v-for="alert in data?.data.alerts ?? []" :key="alert.id" class="alert-card" :data-tone="alert.tone">
          <div class="alert-copy">
            <p class="eyebrow">待处理</p>
            <h2>{{ alert.title }}</h2>
            <p>{{ alert.description }}</p>
          </div>
          <NuxtLink class="ghost-link" :to="alert.to">{{ alert.actionLabel }}</NuxtLink>
        </article>
        <EmptyState
          v-if="(data?.data.alerts ?? []).length === 0"
          title="当前没有阻塞项"
          description="模型、自动任务和最近运行都处于稳定状态。"
          action-label="查看运行中心"
          to="/runs"
        />
      </section>

      <div class="dashboard-grid">
        <article class="stack-card section-card">
          <div class="section-header">
            <div>
              <p class="eyebrow">Upcoming</p>
              <h2>即将运行的员工</h2>
            </div>
            <NuxtLink class="ghost-link" to="/employees">员工中心</NuxtLink>
          </div>
          <div class="entity-list">
            <NuxtLink
              v-for="employee in data?.data.upcomingEmployees ?? []"
              :key="employee.id"
              class="entity-row"
              :to="`/employees/${employee.id}`"
            >
              <div>
                <strong>{{ employee.name }}</strong>
                <p>{{ employee.description || "等待补充职责说明" }}</p>
              </div>
              <span>{{ employee.schedule?.nextRunAt ? formatDateTime(employee.schedule.nextRunAt) : "等待配置" }}</span>
            </NuxtLink>
            <EmptyState
              v-if="(data?.data.upcomingEmployees ?? []).length === 0"
              title="还没有自动任务"
              description="先在员工中心创建员工并配置自动任务。"
              action-label="去创建"
              to="/employees"
            />
          </div>
        </article>

        <article class="stack-card section-card">
          <div class="section-header">
            <div>
              <p class="eyebrow">Recent Runs</p>
              <h2>最新产出与执行</h2>
            </div>
            <NuxtLink class="ghost-link" to="/runs">运行中心</NuxtLink>
          </div>
          <div class="run-feed">
            <NuxtLink v-for="run in data?.data.recentRuns ?? []" :key="run.id" class="run-feed-card" :to="`/runs?runId=${run.id}`">
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
              v-if="(data?.data.recentRuns ?? []).length === 0"
              title="还没有运行记录"
              description="员工开始自动运行或收到聊天指令后，结果会在这里汇总展示。"
            />
          </div>
        </article>
      </div>
    </section>
  </main>
</template>
