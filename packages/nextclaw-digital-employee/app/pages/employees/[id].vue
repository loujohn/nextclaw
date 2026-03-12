<script setup lang="ts">
import { formatScheduleSummary } from "~~/shared/ui-models";

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
  <main class="app-shell">
    <AppNav />
    <section class="page-panel workbench-shell" v-if="data?.data">
      <section class="workbench-hero">
        <div>
          <p class="eyebrow">Employee Workbench</p>
          <h1>{{ data.data.name }}</h1>
          <p class="hero-copy compact">{{ data.data.description || "这个员工已经可以开始处理对话、自动任务和业务结果。" }}</p>
        </div>

        <div class="hero-metrics">
          <article class="metric-card">
            <span class="metric-label">系统编码</span>
            <strong>{{ data.data.code }}</strong>
          </article>
          <article class="metric-card">
            <span class="metric-label">已绑定技能</span>
            <strong>{{ data.data.skills.length }}</strong>
          </article>
          <article class="metric-card">
            <span class="metric-label">自动运行</span>
            <strong>{{ formatScheduleSummary(data.data.schedule) }}</strong>
          </article>
          <article class="metric-card">
            <span class="metric-label">最近状态</span>
            <strong>{{ data.data.recentRuns[0]?.status ?? "idle" }}</strong>
          </article>
        </div>
      </section>

      <div class="tab-strip">
        <NuxtLink
          v-for="tab in tabs"
          :key="tab.to"
          :to="tab.to"
          class="tab-link"
          :class="{ active: $route.path === tab.to }"
        >
          {{ tab.label }}
        </NuxtLink>
      </div>

      <div class="workbench-layout">
        <aside class="workbench-sidebar">
          <article class="stack-card">
            <p class="eyebrow">Context</p>
            <h2>工作台状态</h2>
            <div class="side-metrics">
              <div>
                <span class="metric-label">系统提示词</span>
                <strong>{{ data.data.health.hasPrompt ? "已配置" : "待补充" }}</strong>
              </div>
              <div>
                <span class="metric-label">技能</span>
                <strong>{{ data.data.health.hasSkills ? "就绪" : "待绑定" }}</strong>
              </div>
              <div>
                <span class="metric-label">自动任务</span>
                <strong>{{ data.data.health.hasSchedule ? "就绪" : "待配置" }}</strong>
              </div>
            </div>
          </article>

          <article class="stack-card">
            <div class="section-header">
              <div>
                <p class="eyebrow">Skills</p>
                <h2>当前技能</h2>
              </div>
              <NuxtLink class="ghost-link" to="/skills">技能中心</NuxtLink>
            </div>
            <div class="tag-list">
              <span v-for="skill in data.data.skills" :key="skill.id" class="tag-item">{{ skill.skillName }}</span>
              <span v-if="data.data.skills.length === 0" class="muted">还没有绑定技能</span>
            </div>
          </article>

          <article class="stack-card">
            <div class="section-header">
              <div>
                <p class="eyebrow">Recent Runs</p>
                <h2>最新执行</h2>
              </div>
            </div>
            <div class="mini-feed">
              <NuxtLink v-for="run in data.data.recentRuns.slice(0, 3)" :key="run.id" class="mini-feed-row" :to="`/runs?runId=${run.id}`">
                <strong>{{ run.status }}</strong>
                <span>{{ run.summary || run.startedAt }}</span>
              </NuxtLink>
              <p v-if="data.data.recentRuns.length === 0" class="muted">还没有运行记录</p>
            </div>
          </article>
        </aside>

        <section class="workbench-main">
          <NuxtPage />
        </section>
      </div>
    </section>
  </main>
</template>
