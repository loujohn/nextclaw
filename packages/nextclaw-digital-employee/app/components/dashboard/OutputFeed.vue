<script setup lang="ts">
import { ClipboardList } from "lucide-vue-next";

const emit = defineEmits<{ clickRun: [id: string] }>();

const PAGE_SIZE = 5;
const currentPage = ref(1);

type RunItem = {
  id: string;
  employeeId: string | null;
  employeeName: string;
  highlight: string;
  summary: string;
  tone: "teal" | "amber" | "slate" | "danger";
  startedAtLabel: string;
};

type RunListPayload = {
  ok: boolean;
  data: {
    items: RunItem[];
    total: number;
    page: number;
    pageSize: number;
  };
};

const { data } = useFetch<RunListPayload>(
  () => `/api/runs?page=${currentPage.value}&pageSize=${PAGE_SIZE}`,
  { key: computed(() => `dashboard-runs:${currentPage.value}`) }
);

const runs = computed(() => data.value?.data.items ?? []);
const total = computed(() => data.value?.data.total ?? 0);
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / PAGE_SIZE)));

function goPage(delta: number) {
  const next = currentPage.value + delta;
  if (next >= 1 && next <= totalPages.value) currentPage.value = next;
}

const STATUS_CONFIG: Record<string, { icon: string; bgClass: string; textClass: string; ringClass: string }> = {
  teal: { icon: "✓", bgClass: "bg-emerald-50", textClass: "text-emerald-500", ringClass: "ring-emerald-100" },
  amber: { icon: "↻", bgClass: "bg-blue-50", textClass: "text-blue-500", ringClass: "ring-blue-100" },
  danger: { icon: "✕", bgClass: "bg-red-50", textClass: "text-red-500", ringClass: "ring-red-100" },
  slate: { icon: "⏳", bgClass: "bg-amber-50", textClass: "text-amber-500", ringClass: "ring-amber-100" },
};

function getStatusConfig(tone: string) {
  return STATUS_CONFIG[tone] ?? { icon: "?", bgClass: "bg-muted", textClass: "text-muted-foreground", ringClass: "ring-border" };
}
</script>

<template>
  <div class="flex flex-col">
    <div class="feed-list flex flex-col">
      <div
        v-for="run in runs"
        :key="run.id"
        class="group flex items-start gap-3 py-3 border-b border-border/30 last:border-b-0 cursor-pointer -mx-1 px-1 rounded-lg transition-all duration-200 hover:bg-muted/30"
        @click="emit('clickRun', run.id)"
      >
        <div
          class="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full text-xs font-bold mt-0.5 ring-1 transition-shadow duration-200 group-hover:shadow-sm"
          :class="[getStatusConfig(run.tone).bgClass, getStatusConfig(run.tone).textClass, getStatusConfig(run.tone).ringClass]"
        >
          {{ getStatusConfig(run.tone).icon }}
        </div>
        <div class="min-w-0 flex-1">
          <p class="text-[13px] font-semibold mb-0.5 group-hover:text-primary transition-colors duration-200">
            <span v-if="run.employeeName" class="text-muted-foreground/70">{{ run.employeeName }} · </span>
            {{ run.highlight || '—' }}
          </p>
          <p v-if="run.summary" class="text-xs text-muted-foreground/80 leading-relaxed line-clamp-2">{{ run.summary }}</p>
        </div>
        <time class="shrink-0 text-[11px] text-muted-foreground/60 mt-0.5 tabular-nums">
          {{ run.startedAtLabel }}
        </time>
      </div>
      <div v-if="runs.length === 0" class="flex flex-col items-center justify-center py-12">
        <ClipboardList class="h-6 w-6 text-muted-foreground/30 mb-2" :stroke-width="1.5" />
        <p class="text-xs text-muted-foreground/70">暂无运行记录</p>
      </div>
    </div>

    <div v-if="totalPages > 1" class="flex items-center justify-center gap-3 pt-3 mt-1 border-t border-border/20">
      <button
        class="flex h-7 w-7 items-center justify-center rounded-md text-xs text-muted-foreground transition-all duration-200 disabled:opacity-30"
        :class="currentPage > 1 ? 'hover:bg-muted hover:text-foreground' : ''"
        :disabled="currentPage <= 1"
        @click="goPage(-1)"
      >‹</button>
      <span class="text-[11px] font-medium text-muted-foreground/70 tabular-nums">{{ currentPage }} / {{ totalPages }}</span>
      <button
        class="flex h-7 w-7 items-center justify-center rounded-md text-xs text-muted-foreground transition-all duration-200 disabled:opacity-30"
        :class="currentPage < totalPages ? 'hover:bg-muted hover:text-foreground' : ''"
        :disabled="currentPage >= totalPages"
        @click="goPage(1)"
      >›</button>
    </div>
  </div>
</template>
