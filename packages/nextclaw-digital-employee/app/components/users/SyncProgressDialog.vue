<script setup lang="ts">
defineProps<{
  open: boolean;
  stageLabel: string;
  progressPercent: number;
  job: {
    status: "running" | "completed" | "failed";
    message: string;
    total: number | null;
    processed: number;
    created: number;
    updated: number;
    skipped: number;
    failed: number;
  };
}>();

const emit = defineEmits<{
  close: [];
}>();
</script>

<template>
  <div v-if="open" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
    <div class="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl">
      <div class="flex items-start justify-between gap-4">
        <div>
          <h3 class="text-base font-semibold text-foreground">同步进度</h3>
          <p class="mt-1 text-sm text-muted-foreground">{{ job.message || "同步任务正在执行，请稍候。" }}</p>
        </div>
        <span
          class="rounded-full px-2.5 py-1 text-xs font-medium"
          :class="job.status === 'failed' ? 'bg-destructive/10 text-destructive' : job.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-primary/10 text-primary'"
        >
          {{ stageLabel }}
        </span>
      </div>

      <div class="mt-4">
        <div class="h-2 overflow-hidden rounded-full bg-muted">
          <div class="h-full rounded-full bg-primary transition-all" :style="{ width: `${progressPercent}%` }" />
        </div>
        <div class="mt-2 flex items-center justify-between text-xs text-muted-foreground">
          <span v-if="job.total !== null">已处理 {{ job.processed }} / {{ job.total }}</span>
          <span v-else>等待拉取外部数据总数...</span>
          <span>{{ progressPercent }}%</span>
        </div>
      </div>

      <div class="mt-4 grid grid-cols-2 gap-3">
        <div class="rounded-xl border border-border bg-muted/30 px-4 py-3">
          <div class="text-xs text-muted-foreground">已拉取人数</div>
          <div class="mt-1 text-lg font-semibold text-foreground">{{ job.total ?? '-' }}</div>
        </div>
        <div class="rounded-xl border border-border bg-muted/30 px-4 py-3">
          <div class="text-xs text-muted-foreground">已处理人数</div>
          <div class="mt-1 text-lg font-semibold text-primary">{{ job.processed }}</div>
        </div>
        <div class="rounded-xl border border-border bg-muted/30 px-4 py-3">
          <div class="text-xs text-muted-foreground">新增人数</div>
          <div class="mt-1 text-lg font-semibold text-emerald-600">{{ job.created }}</div>
        </div>
        <div class="rounded-xl border border-border bg-muted/30 px-4 py-3">
          <div class="text-xs text-muted-foreground">更新人数</div>
          <div class="mt-1 text-lg font-semibold text-primary">{{ job.updated }}</div>
        </div>
        <div class="rounded-xl border border-border bg-muted/30 px-4 py-3">
          <div class="text-xs text-muted-foreground">跳过人数</div>
          <div class="mt-1 text-lg font-semibold text-amber-600">{{ job.skipped }}</div>
        </div>
        <div class="rounded-xl border border-border bg-muted/30 px-4 py-3">
          <div class="text-xs text-muted-foreground">失败人数</div>
          <div class="mt-1 text-lg font-semibold" :class="job.failed > 0 ? 'text-destructive' : 'text-foreground'">{{ job.failed }}</div>
        </div>
      </div>

      <div class="mt-4 rounded-xl bg-muted/40 px-4 py-3 text-xs text-muted-foreground">
        关闭此弹窗不会终止同步，后台任务会继续执行。你可以稍后再次点击顶部“同步中”按钮查看最新进度。
      </div>

      <div class="mt-5 flex justify-end gap-2">
        <button class="btn-ghost text-sm" @click="emit('close')">
          {{ job.status === 'running' ? "关闭窗口（同步继续）" : "关闭" }}
        </button>
      </div>
    </div>
  </div>
</template>