<script setup lang="ts">
import { formatDateTime } from "~~/shared/ui-models";
import { Users, Clock, AlertTriangle, Blocks, ArrowRight, Sparkles } from "lucide-vue-next";

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

const { data, pending } = await useFetch<DashboardPayload>("/api/dashboard");

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

const toneClass: Record<string, string> = {
  teal: "border-primary/20 bg-primary/5",
  amber: "border-warning/20 bg-warning/5",
  slate: "border-border",
  danger: "border-destructive/20 bg-destructive/5",
  rose: "border-destructive/20 bg-destructive/5"
};

const badgeClass: Record<string, string> = {
  teal: "bg-primary/10 text-primary",
  amber: "bg-warning/10 text-warning-foreground",
  slate: "bg-muted text-muted-foreground",
  danger: "bg-destructive/10 text-destructive",
  rose: "bg-destructive/10 text-destructive"
};
</script>

<template>
  <PageSkeleton v-if="pending && !data" />
  <div v-else class="mx-auto max-w-6xl space-y-6 p-6 lg:p-8">
    <!-- Header -->
    <header class="hero-section">
      <div class="relative space-y-3">
        <span class="section-label">工作中心</span>
        <h1 class="font-display text-3xl font-bold tracking-tight lg:text-4xl">
          运行态势与待处理事项
        </h1>
        <p class="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          聚焦数字员工的运行状态、异常处理和最新产出。
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

    <!-- Two Column Grid -->
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

      <!-- Recent Runs -->
      <section>
        <div class="mb-3 flex items-center justify-between">
          <div>
            <span class="section-label">最近执行</span>
            <h2 class="mt-0.5 text-lg font-semibold">最新产出与结果</h2>
          </div>
          <NuxtLink to="/runs" class="text-sm font-medium text-muted-foreground transition-colors hover:text-primary">
            运行中心 →
          </NuxtLink>
        </div>

        <div class="space-y-2">
          <NuxtLink
            v-for="run in data?.data.recentRuns ?? []"
            :key="run.id"
            :to="`/runs?runId=${run.id}`"
            class="group block rounded-lg border border-border bg-card px-4 py-3 transition-all hover:border-primary/20 hover:shadow-sm"
          >
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0">
                <p class="truncate text-sm font-medium group-hover:text-primary">{{ run.employeeName }}</p>
                <p class="text-xs text-muted-foreground">{{ run.triggerLabel }} · {{ run.startedAtLabel }}</p>
              </div>
              <span class="shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold" :class="badgeClass[run.tone]">
                {{ run.statusLabel }}
              </span>
            </div>
            <p v-if="run.highlight" class="mt-2 text-sm font-medium">{{ run.highlight }}</p>
            <p v-if="run.summary" class="mt-1 line-clamp-2 text-xs text-muted-foreground">{{ run.summary }}</p>
          </NuxtLink>

          <div
            v-if="(data?.data.recentRuns ?? []).length === 0"
            class="flex items-center gap-3 rounded-lg border border-dashed border-border p-4"
          >
            <Sparkles class="h-4 w-4 shrink-0 text-primary" :stroke-width="1.8" />
            <div>
              <p class="text-sm font-medium">还没有运行记录</p>
              <p class="text-xs text-muted-foreground">员工开始自动运行或收到聊天指令后，结果会在这里汇总展示。</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>
