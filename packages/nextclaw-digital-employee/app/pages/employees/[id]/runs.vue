<script setup lang="ts">
import { Sparkles } from "lucide-vue-next";

const route = useRoute();
const employeeId = computed(() => String(route.params.id));
const { data } = await useFetch(`/api/employees/${employeeId.value}/runs`, {
  key: computed(() => `employee-runs:${employeeId.value}:history`)
});
</script>

<template>
  <div class="rounded-xl border border-border bg-card p-5 shadow-sm">
    <div class="mb-4 flex items-center justify-between">
      <div>
        <span class="section-label">历史记录</span>
        <h2 class="mt-0.5 text-lg font-semibold">运行历史</h2>
      </div>
      <NuxtLink to="/runs" class="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
        运行中心 →
      </NuxtLink>
    </div>

    <div class="space-y-2">
      <NuxtLink
        v-for="run in (data as any)?.data ?? []"
        :key="run.id"
        :to="`/runs?runId=${run.id}`"
        class="group block rounded-lg border border-border p-3 transition-all hover:border-primary/20 hover:shadow-sm"
      >
        <div class="flex items-center justify-between gap-2">
          <span class="text-sm font-semibold group-hover:text-primary">{{ run.status }}</span>
          <span class="text-xs text-muted-foreground">{{ run.startedAt }}</span>
        </div>
        <p class="mt-1 text-sm text-muted-foreground">{{ run.summary || "等待结果摘要" }}</p>
      </NuxtLink>
    </div>

    <div
      v-if="((data as any)?.data ?? []).length === 0"
      class="mt-4 flex items-center gap-3 rounded-lg border border-dashed border-border p-4"
    >
      <Sparkles class="h-4 w-4 shrink-0 text-primary" :stroke-width="1.8" />
      <div>
        <p class="text-sm font-medium">还没有运行历史</p>
        <p class="text-xs text-muted-foreground">先通过聊天或自动任务触发一次执行。</p>
      </div>
    </div>
  </div>
</template>
