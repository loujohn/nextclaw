<script setup lang="ts">
const expandedUnbound = ref(false);

defineProps<{
  open: boolean;
  summary: {
    total: number;
    created: number;
    updated: number;
    skipped: number;
    failed: number;
    autoBound: number;
    summary: string;
    createdUsers: string[];
    unboundUsers: Array<{ name: string; dingTalkId: string }>;
  };
}>();

const emit = defineEmits<{
  close: [];
}>();
</script>

<template>
  <div v-if="open" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
    <div class="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-card p-6 shadow-2xl">
      <div class="flex items-start justify-between gap-4">
        <div>
          <h3 class="text-base font-semibold text-foreground">同步完成</h3>
          <p class="mt-2 text-sm text-muted-foreground">
            {{ summary.summary || "用户同步已完成，本次结果如下。" }}
          </p>
        </div>
        <button class="rounded px-2 py-1 text-sm text-muted-foreground hover:bg-muted" @click="emit('close')">
          关闭
        </button>
      </div>

      <div class="mt-4 flex-1 overflow-y-auto pr-1">
        <div class="grid grid-cols-2 gap-3">
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

        <div class="mt-3 rounded-xl border border-sky-200 bg-sky-50/70 px-4 py-3">
          <div class="text-xs text-sky-700">自动关联人数</div>
          <div class="mt-1 text-lg font-semibold text-sky-700">
            {{ summary.autoBound }}
          </div>
        </div>

        <div v-if="summary.createdUsers.length > 0" class="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 py-3">
          <div class="text-xs text-emerald-700">本次新增人员</div>
          <div class="mt-2 max-h-40 overflow-y-auto rounded-lg bg-white/80 px-3 py-2 text-sm text-foreground">
            <div class="flex flex-wrap gap-2">
              <span
                v-for="name in summary.createdUsers"
                :key="name"
                class="rounded-full border border-emerald-200 bg-white px-2.5 py-1 text-xs text-emerald-700"
              >
                {{ name }}
              </span>
            </div>
          </div>
        </div>

        <div v-if="summary.unboundUsers.length > 0" class="mt-3 rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3">
          <div class="flex items-center justify-between gap-3">
            <div class="text-xs text-amber-700">未关联人员（{{ summary.unboundUsers.length }} 人）</div>
            <button class="text-xs text-amber-700 hover:underline" @click="expandedUnbound = !expandedUnbound">
              {{ expandedUnbound ? '收起' : '展开' }}
            </button>
          </div>
          <div
            class="mt-2 rounded-lg bg-white/70 px-3 py-2 text-sm text-amber-900"
            :class="expandedUnbound ? 'max-h-56 overflow-y-auto' : 'max-h-24 overflow-y-auto'"
          >
            <div class="grid gap-2 sm:grid-cols-2">
              <div
                v-for="user in summary.unboundUsers"
                :key="`${user.name}-${user.dingTalkId}`"
                class="rounded-lg border border-amber-200 bg-white px-3 py-2"
              >
                <div class="text-sm font-medium text-amber-950">{{ user.name }}</div>
                <div class="mt-1 text-xs text-amber-700 break-all">
                  DingTalkId: {{ user.dingTalkId || '-' }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="mt-5 flex justify-end gap-2 border-t border-border pt-4">
        <button class="btn-primary text-sm" @click="emit('close')">我知道了</button>
      </div>
    </div>
  </div>
</template>
