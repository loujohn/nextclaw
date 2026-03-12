<script setup lang="ts">
import { formatScheduleSummary } from "~~/shared/ui-models";
import { CircleCheck, CircleAlert, Clock } from "lucide-vue-next";

const route = useRoute();
const employeeId = computed(() => String(route.params.id));
const { data } = await useEmployeeDetail(employeeId);

const tabs = computed(() => [
  { label: "概览", to: `/employees/${employeeId.value}` },
  { label: "聊天", to: `/employees/${employeeId.value}/chat` },
  { label: "运行记录", to: `/employees/${employeeId.value}/runs` }
]);
</script>

<template>
  <div class="mx-auto max-w-6xl space-y-6 p-6 lg:p-8" v-if="data?.data">
    <Breadcrumb :items="[
      { label: '员工中心', to: '/employees' },
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
          <p class="text-[11px] uppercase tracking-wider text-muted-foreground">自动运行</p>
          <p class="text-sm font-semibold">{{ formatScheduleSummary(data.data.schedule) }}</p>
        </div>
        <div class="space-y-1">
          <p class="text-[11px] uppercase tracking-wider text-muted-foreground">最近状态</p>
          <p class="text-sm font-semibold">{{ data.data.recentRuns[0]?.status ?? "idle" }}</p>
        </div>
      </div>
    </header>

    <!-- Tabs -->
    <nav class="flex gap-2">
      <NuxtLink
        v-for="tab in tabs"
        :key="tab.to"
        :to="tab.to"
        class="rounded-full px-4 py-2 text-sm font-medium transition-colors"
        :class="$route.path === tab.to
          ? 'bg-primary text-primary-foreground'
          : 'border border-border bg-card text-muted-foreground hover:text-foreground'"
      >
        {{ tab.label }}
      </NuxtLink>
    </nav>

    <!-- Content -->
    <div class="grid gap-6 lg:grid-cols-[280px_1fr]">
      <!-- Sidebar -->
      <aside class="space-y-4 lg:sticky lg:top-6 lg:self-start">
        <div class="rounded-xl border border-border bg-card p-4 shadow-sm">
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
                :is="data.data.health.hasSchedule ? CircleCheck : CircleAlert"
                class="h-4 w-4"
                :class="data.data.health.hasSchedule ? 'text-primary' : 'text-warning'"
                :stroke-width="1.8"
              />
              <span class="text-sm">自动任务 {{ data.data.health.hasSchedule ? "就绪" : "待配置" }}</span>
            </div>
          </div>
        </div>

        <div class="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div class="mb-3 flex items-center justify-between">
            <span class="section-label">已绑定技能</span>
            <NuxtLink to="/skills" class="text-xs text-muted-foreground hover:text-foreground">技能中心 →</NuxtLink>
          </div>
          <div class="flex flex-wrap gap-1.5">
            <span v-for="skill in data.data.skills" :key="skill.id" class="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
              {{ skill.skillName }}
            </span>
            <span v-if="data.data.skills.length === 0" class="text-xs text-muted-foreground">还没有绑定技能</span>
          </div>
        </div>

        <div class="rounded-xl border border-border bg-card p-4 shadow-sm">
          <span class="section-label mb-3 block">最近运行</span>
          <div class="space-y-2">
            <NuxtLink
              v-for="run in data.data.recentRuns.slice(0, 3)"
              :key="run.id"
              :to="`/runs?runId=${run.id}`"
              class="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm transition-colors hover:bg-muted/50"
            >
              <span class="font-medium">{{ run.status }}</span>
              <span class="truncate text-xs text-muted-foreground">{{ run.summary || run.startedAt }}</span>
            </NuxtLink>
            <p v-if="data.data.recentRuns.length === 0" class="text-xs text-muted-foreground">还没有运行记录</p>
          </div>
        </div>
      </aside>

      <!-- Main Content -->
      <section>
        <NuxtPage />
      </section>
    </div>
  </div>
</template>
