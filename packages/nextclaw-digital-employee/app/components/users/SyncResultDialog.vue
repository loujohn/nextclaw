<script setup lang="ts">
defineProps<{
  open: boolean;
  summary: {
    total: number;
    created: number;
    updated: number;
    skipped: number;
    failed: number;
    summary: string;
  };
}>();

const emit = defineEmits<{
  close: [];
}>();
</script>

<template>
  <div v-if="open" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
    <div class="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl">
      <h3 class="text-base font-semibold text-foreground">同步完成</h3>
      <p class="mt-2 text-sm text-muted-foreground">
        {{ summary.summary || "用户同步已完成，本次结果如下。" }}
      </p>

      <div class="mt-4 grid grid-cols-2 gap-3">
        <div class="rounded-xl border border-border bg-muted/30 px-4 py-3">
          <div class="text-xs text-muted-foreground">拉取人数</div>
          <div class="mt-1 text-lg font-semibold text-foreground">{{ summary.total }}</div>
        </div>
        <div class="rounded-xl border border-border bg-muted/30 px-4 py-3">
          <div class="text-xs text-muted-foreground">新增人数</div>
          <div class="mt-1 text-lg font-semibold text-emerald-600">{{ summary.created }}</div>
        </div>
        <div class="rounded-xl border border-border bg-muted/30 px-4 py-3">
          <div class="text-xs text-muted-foreground">更新人数</div>
          <div class="mt-1 text-lg font-semibold text-primary">{{ summary.updated }}</div>
        </div>
        <div class="rounded-xl border border-border bg-muted/30 px-4 py-3">
          <div class="text-xs text-muted-foreground">跳过人数</div>
          <div class="mt-1 text-lg font-semibold text-amber-600">{{ summary.skipped }}</div>
        </div>
      </div>

      <div class="mt-3 rounded-xl border border-border bg-muted/20 px-4 py-3">
        <div class="text-xs text-muted-foreground">失败人数</div>
        <div class="mt-1 text-lg font-semibold" :class="summary.failed > 0 ? 'text-destructive' : 'text-foreground'">
          {{ summary.failed }}
        </div>
      </div>

      <div class="mt-5 flex justify-end gap-2">
        <button class="btn-primary text-sm" @click="emit('close')">我知道了</button>
      </div>
    </div>
  </div>
</template>
