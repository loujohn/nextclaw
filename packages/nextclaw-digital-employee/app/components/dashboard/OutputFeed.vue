<script setup lang="ts">
const props = defineProps<{
  runs: Array<{
    id: string;
    employeeName?: string;
    skillDisplayName?: string;
    status: string;
    summary?: string | null;
    startedAt: string | null;
    finishedAt: string | null;
  }>;
  pageSize?: number;
}>();

const emit = defineEmits<{ clickRun: [id: string] }>();

const PAGE_SIZE = props.pageSize ?? 5;
const currentPage = ref(1);

const totalPages = computed(() => Math.max(1, Math.ceil(props.runs.length / PAGE_SIZE)));
const pagedRuns = computed(() => {
  const start = (currentPage.value - 1) * PAGE_SIZE;
  return props.runs.slice(start, start + PAGE_SIZE);
});

function goPage(delta: number) {
  const next = currentPage.value + delta;
  if (next >= 1 && next <= totalPages.value) currentPage.value = next;
}

const STATUS_CONFIG: Record<string, { icon: string; dotClass: string }> = {
  running: { icon: "↻", dotClass: "bg-[#eff6ff] text-[#3b82f6]" },
  succeeded: { icon: "✓", dotClass: "bg-[#ecfdf5] text-[#10b981]" },
  failed: { icon: "!", dotClass: "bg-[#fffbeb] text-[#f59e0b]" },
  queued: { icon: "⏳", dotClass: "bg-[#fffbeb] text-[#f59e0b]" },
};

function getStatusConfig(status: string) {
  return STATUS_CONFIG[status] ?? { icon: "?", dotClass: "bg-muted text-muted-foreground" };
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "刚刚";
  if (mins < 60) return `${mins} 分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.floor(hours / 24)} 天前`;
}
</script>

<template>
  <div class="flex flex-col">
    <div class="feed-list flex flex-col">
      <div
        v-for="run in pagedRuns"
        :key="run.id"
        class="flex items-start gap-3 py-3 border-b border-border/40 last:border-b-0 cursor-pointer"
        @click="emit('clickRun', run.id)"
      >
        <div
          class="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full text-xs font-semibold mt-0.5"
          :class="getStatusConfig(run.status).dotClass"
        >
          {{ getStatusConfig(run.status).icon }}
        </div>
        <div class="min-w-0 flex-1">
          <p class="text-[13px] font-semibold mb-0.5">
            <span v-if="run.employeeName" class="text-muted-foreground">{{ run.employeeName }} · </span>
            {{ run.skillDisplayName || '—' }}
          </p>
          <p v-if="run.summary" class="text-xs text-muted-foreground leading-relaxed line-clamp-2">{{ run.summary }}</p>
        </div>
        <time class="shrink-0 text-[11px] text-muted-foreground/70 mt-0.5">
          {{ timeAgo(run.finishedAt ?? run.startedAt) }}
        </time>
      </div>
      <div v-if="runs.length === 0" class="flex items-center justify-center py-10">
        <p class="text-xs text-muted-foreground">暂无运行记录</p>
      </div>
    </div>

    <!-- Pagination -->
    <div v-if="totalPages > 1" class="flex items-center justify-center gap-3 pt-3 mt-1 border-t border-border/30">
      <button
        class="flex h-6 w-6 items-center justify-center rounded text-xs text-muted-foreground transition-colors disabled:opacity-30"
        :class="currentPage > 1 ? 'hover:bg-muted' : ''"
        :disabled="currentPage <= 1"
        @click="goPage(-1)"
      >‹</button>
      <span class="text-[11px] font-medium text-muted-foreground">{{ currentPage }} / {{ totalPages }}</span>
      <button
        class="flex h-6 w-6 items-center justify-center rounded text-xs text-muted-foreground transition-colors disabled:opacity-30"
        :class="currentPage < totalPages ? 'hover:bg-muted' : ''"
        :disabled="currentPage >= totalPages"
        @click="goPage(1)"
      >›</button>
    </div>
  </div>
</template>
