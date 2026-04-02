<script setup lang="ts">
import { X, CalendarClock } from "lucide-vue-next";
import { renderMarkdown } from "~/lib/utils";
import { formatDateTime } from "~~/shared/ui-models";

type RunDetail = {
  employeeName: string;
  statusLabel: string;
  triggerLabel: string;
  scheduleJobName: string | null;
  summary: string;
  result: Record<string, unknown>;
  events: Array<{
    id: string;
    seq: number;
    eventType: string;
    payload: Record<string, unknown>;
    createdAt: string;
  }>;
};

defineProps<{
  run: RunDetail | null;
  loading?: boolean;
}>();

const emit = defineEmits<{ close: [] }>();
</script>

<template>
  <Teleport to="body">
    <Transition name="slide-over">
      <div v-if="run" class="fixed inset-0 z-50 flex justify-end">
        <div class="absolute inset-0 bg-foreground/20 backdrop-blur-sm" @click="emit('close')" />
        <div class="slide-over-panel relative w-full max-w-lg flex flex-col h-full bg-card shadow-2xl">

          <!-- 固定头部 -->
          <div class="shrink-0 flex items-center justify-between border-b border-border bg-card/95 px-6 py-4 backdrop-blur-sm">
            <div>
              <span class="section-label">运行详情</span>
              <h2 class="mt-0.5 text-lg font-semibold">{{ run.employeeName }}</h2>
            </div>
            <button
              class="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              @click="emit('close')"
            >
              <X class="h-5 w-5" :stroke-width="1.8" />
            </button>
          </div>

          <!-- 滚动内容区 -->
          <div class="flex-1 overflow-y-auto flex flex-col">

            <!-- 首屏块：meta + 结果摘要，撑满剩余视口高度 -->
            <div class="flex flex-col p-6 gap-5 min-h-full">

              <!-- Meta 三格 -->
              <div class="grid grid-cols-3 gap-4">
                <div class="rounded-lg bg-muted/30 p-3">
                  <p class="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">触发方式</p>
                  <p class="mt-1 text-sm font-semibold">{{ run.triggerLabel }}</p>
                </div>
                <div class="rounded-lg bg-muted/30 p-3">
                  <p class="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">状态</p>
                  <p class="mt-1 text-sm font-semibold">{{ run.statusLabel }}</p>
                </div>
                <div class="rounded-lg bg-muted/30 p-3">
                  <p class="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">事件数</p>
                  <p class="mt-1 text-sm font-semibold">{{ run.events.length }}</p>
                </div>
              </div>

              <!-- 定时任务来源（可选） -->
              <div
                v-if="run.scheduleJobName"
                class="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5"
              >
                <CalendarClock class="h-4 w-4 shrink-0 text-primary" :stroke-width="1.8" />
                <div>
                  <p class="text-[11px] font-medium text-muted-foreground">来源定时任务</p>
                  <p class="text-sm font-semibold text-primary">{{ run.scheduleJobName }}</p>
                </div>
              </div>

              <!-- 结果摘要：flex-1 撑满首屏剩余高度，内容超长时内部滚动 -->
              <div class="flex-1 flex flex-col min-h-[200px]">
                <span class="section-label">结果摘要</span>
                <div
                  class="run-detail-md mt-2 flex-1 min-h-0 overflow-y-auto rounded-lg bg-muted/20 px-4 py-3 text-sm leading-relaxed text-muted-foreground"
                  v-html="renderMarkdown(run.summary || '等待结果摘要')"
                />
              </div>
            </div>

            <!-- 折叠区：关键事件 + 原始结果，向下滚动可见 -->
            <div class="px-6 pb-6 space-y-5">

              <!-- 关键事件 -->
              <div>
                <span class="section-label">关键事件</span>
                <div class="mt-2 space-y-2">
                  <div
                    v-for="event in run.events"
                    :key="event.id"
                    class="rounded-lg bg-muted/30 px-3 py-2.5"
                  >
                    <div class="flex items-center gap-3">
                      <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">{{ event.seq }}</span>
                      <span class="text-sm font-medium">{{ event.eventType }}</span>
                      <span v-if="event.createdAt" class="ml-auto text-[11px] text-muted-foreground">{{ formatDateTime(event.createdAt) }}</span>
                    </div>
                    <div v-if="event.payload && Object.keys(event.payload).length > 0" class="mt-1.5 ml-9">
                      <pre class="max-h-32 overflow-auto rounded bg-background/50 p-2 text-[11px] leading-relaxed text-muted-foreground">{{ JSON.stringify(event.payload, null, 2) }}</pre>
                    </div>
                  </div>
                  <p v-if="run.events.length === 0" class="text-sm text-muted-foreground">暂无事件记录。</p>
                </div>
              </div>

              <!-- 原始结果 -->
              <details class="rounded-lg border border-border">
                <summary class="cursor-pointer px-4 py-3 text-sm font-medium hover:bg-muted/30 transition-colors">查看原始结果</summary>
                <pre class="overflow-auto border-t border-border bg-muted/20 px-4 py-3 font-mono text-xs leading-relaxed">{{ JSON.stringify(run.result, null, 2) }}</pre>
              </details>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
