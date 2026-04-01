<script setup lang="ts">
import { formatRunStatusLabel, formatDateTime, translateRunText } from "~~/shared/ui-models";
import { CircleCheck, CircleAlert, MessageSquare } from "lucide-vue-next";

const route = useRoute();
const employeeId = computed(() => String(route.params.id));
const { data } = await useEmployeeDetail(employeeId);
const isOverviewTab = computed(() => route.path === `/employees/${employeeId.value}`);
const employeeCenterLink = computed(() => ({
  path: "/employees",
  query: route.query
}));
const employeeChatLink = computed(() => ({
  path: `/employees/${employeeId.value}/chat`,
  query: route.query
}));

// Department info for breadcrumb
const { data: departmentsData } = await useFetch<{ ok: boolean; data: Array<{ id: string; name: string }> }>("/api/departments");
const deptName = computed(() => {
  const deptId = data.value?.data?.departmentId;
  if (!deptId) return null;
  return departmentsData.value?.data?.find((d) => d.id === deptId)?.name ?? null;
});
const deptLink = computed(() => {
  const deptId = data.value?.data?.departmentId;
  if (!deptId) return null;
  return { path: "/employees", query: { view: "list", deptId } };
});

// Skills catalog for Chinese name display
const { data: skillsData } = await useFetch<{ ok: boolean; data: Array<{ name: string; nameZh?: string }> }>("/api/skills");
const skillNameZhMap = computed(() => {
  const map = new Map<string, string>();
  for (const skill of skillsData.value?.data ?? []) {
    if (skill.nameZh) map.set(skill.name, skill.nameZh);
  }
  return map;
});
function getSkillDisplayName(skillName: string): string {
  return skillNameZhMap.value.get(skillName) || skillName;
}

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
</script>

<template>
  <div class="mx-auto max-w-6xl space-y-6 p-6 lg:p-8" v-if="data?.data">
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

    <!-- Content -->
    <div v-if="isOverviewTab" class="space-y-4">
      <!-- Row 1: 状态检查 + 最近运行 (等高) -->
      <div class="grid gap-4 lg:grid-cols-[3fr_7fr] items-stretch">
        <!-- 状态检查 -->
        <div class="flex flex-col rounded-xl border border-border bg-card p-4 shadow-sm">
          <span class="section-label">状态检查</span>
          <h3 class="mt-0.5 mb-3 text-sm font-semibold">工作台状态</h3>
          <div class="space-y-3">
            <div class="flex items-center gap-2">
              <component
                :is="data.data.health.hasPrompt ? CircleCheck : CircleAlert"
                class="h-4 w-4"
                :class="data.data.health.hasPrompt ? 'text-primary' : 'text-warning'"
                :stroke-width="1.8"
              />
              <span class="text-sm">系统提示词 {{ data.data.health.hasPrompt ? "已配置" : "待补充" }}</span>
            </div>
            <div class="flex items-center gap-2">
              <component
                :is="data.data.health.hasSkills ? CircleCheck : CircleAlert"
                class="h-4 w-4"
                :class="data.data.health.hasSkills ? 'text-primary' : 'text-warning'"
                :stroke-width="1.8"
              />
              <span class="text-sm">技能 {{ data.data.health.hasSkills ? "就绪" : "待绑定" }}</span>
            </div>
            <div class="flex items-center gap-2">
              <component
                :is="data.data.automationSummary.healthOk ? CircleCheck : CircleAlert"
                class="h-4 w-4"
                :class="{
                  'text-primary': data.data.automationSummary.tone === 'teal',
                  'text-warning': data.data.automationSummary.tone === 'amber',
                  'text-destructive': data.data.automationSummary.tone === 'danger',
                  'text-muted-foreground': data.data.automationSummary.tone === 'slate'
                }"
                :stroke-width="1.8"
              />
              <span class="text-sm">
                定时任务 ·
                <span class="font-medium">{{ data.data.automationSummary.countLabel }}</span>
                · {{ data.data.automationSummary.statusLabel }}
              </span>
            </div>
          </div>
        </div>

        <!-- 最近运行 -->
        <div class="flex flex-col rounded-xl border border-border bg-card p-4 shadow-sm min-w-0 overflow-hidden">
          <span class="section-label mb-3 block">最近运行</span>
          <div class="space-y-2">
            <NuxtLink
              v-for="run in data.data.recentRuns.slice(0, 3)"
              :key="run.id"
              :to="`/runs?runId=${run.id}`"
              class="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm transition-colors hover:bg-muted/50"
            >
              <span class="shrink-0 whitespace-nowrap font-medium">{{ formatRunStatusLabel(run.status) }}</span>
              <span class="min-w-0 truncate text-xs text-muted-foreground">{{ translateRunText(run.summary) || formatDateTime(run.startedAt) }}</span>
            </NuxtLink>
            <p v-if="data.data.recentRuns.length === 0" class="text-xs text-muted-foreground">还没有运行记录</p>
          </div>
        </div>
      </div>

      <!-- Row 2: 已绑定技能 + 角色定义 (自适应高度) -->
      <div class="grid gap-4 lg:grid-cols-[3fr_7fr] items-start">
        <!-- 已绑定技能 -->
        <div class="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div class="mb-3 flex items-center justify-between">
            <span class="section-label">已绑定技能</span>
            <NuxtLink to="/skills" class="text-xs text-muted-foreground hover:text-foreground">技能中心 →</NuxtLink>
          </div>
          <div class="flex flex-wrap gap-1.5">
            <span v-for="skill in data.data.skills" :key="skill.id" class="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
              {{ getSkillDisplayName(skill.skillName) }}
            </span>
            <span v-if="data.data.skills.length === 0" class="text-xs text-muted-foreground">还没有绑定技能</span>
          </div>
        </div>

        <!-- 角色定义 -->
        <div class="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          <div class="flex items-center justify-between px-4 py-3 border-b border-border">
            <div>
              <span class="section-label">角色定义</span>
              <h3 class="mt-0.5 text-sm font-semibold">职责与人设</h3>
            </div>
            <NuxtLink :to="employeeChatLink" class="btn-primary">
              <MessageSquare class="h-3.5 w-3.5" :stroke-width="1.8" />
              进入聊天
            </NuxtLink>
          </div>
          <div class="p-4 space-y-3">
            <p class="text-sm leading-relaxed text-muted-foreground">
              {{ data.data.description || "未填写职责说明" }}
            </p>
            <div class="rounded-lg bg-muted/40 border border-border p-3">
              <p class="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">系统提示词</p>
              <pre class="font-mono text-xs leading-relaxed text-foreground whitespace-pre-wrap">{{ data.data.systemPrompt || "尚未配置系统提示词" }}</pre>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Non-overview tab content -->
    <section v-else>
      <NuxtPage />
    </section>
  </div>
</template>
