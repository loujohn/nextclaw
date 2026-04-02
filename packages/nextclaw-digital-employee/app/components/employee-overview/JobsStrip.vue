<script setup lang="ts">
import { cronHumanLabel, everyMsHumanLabel } from "~~/shared/cron-utils";
import { Zap, Clock } from "lucide-vue-next";

defineProps<{
  jobs: Array<{
    id: string;
    name: string;
    scheduleKind: string;
    cronExpr: string | null;
    everyMs: number | null;
    enabled: boolean;
    nextRunAt: string | null;
  }>;
}>();

const emit = defineEmits<{ goToJobs: [] }>();

function scheduleDetail(job: { scheduleKind: string; cronExpr: string | null; everyMs: number | null }) {
  if (job.scheduleKind === "cron") return cronHumanLabel(job.cronExpr ?? "");
  if (job.scheduleKind === "every") return everyMsHumanLabel(job.everyMs ?? 0);
  return "—";
}

function scheduleKindLabel(kind: string) {
  return kind === "every" ? "固定间隔" : "按时间表";
}

function formatNextRun(dateStr: string | null): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
  if (isToday) return `今天 ${time}`;
  return `${d.toLocaleDateString("zh-CN", { month: "short", day: "numeric" })} ${time}`;
}
</script>

<template>
  <section class="rounded-2xl border border-border/60 bg-card overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
    <div class="flex items-center justify-between px-5 py-3.5 border-b border-border/60">
      <h3 class="text-sm font-bold">定时任务概览</h3>
      <div class="flex items-center gap-2">
        <span class="text-[10px] font-semibold text-primary bg-primary/8 px-2 py-[2px] rounded-md">
          {{ jobs.length }} 个任务
        </span>
        <button
          class="text-[11px] font-medium text-muted-foreground/70 hover:text-primary transition-colors duration-200"
          @click="emit('goToJobs')"
        >
          查看全部 →
        </button>
      </div>
    </div>
    <div class="grid" style="grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));">
      <div
        v-for="(job, i) in jobs"
        :key="job.id"
        class="group px-[18px] py-4 cursor-pointer transition-all duration-200 hover:bg-muted/20"
        :class="i < jobs.length - 1 ? 'border-r border-border/30' : ''"
      >
        <div class="flex items-center gap-2 mb-2">
          <span
            class="flex h-7 w-7 items-center justify-center rounded-lg ring-1 shadow-sm transition-colors"
            :class="job.scheduleKind === 'every'
              ? 'bg-amber-50 text-amber-500 ring-amber-200/50'
              : 'bg-blue-50 text-blue-500 ring-blue-200/50'"
          >
            <component :is="job.scheduleKind === 'every' ? Zap : Clock" class="h-3.5 w-3.5" :stroke-width="2" />
          </span>
          <span class="text-[13px] font-bold truncate flex-1 group-hover:text-primary transition-colors duration-200">{{ job.name }}</span>
          <span
            class="shrink-0 rounded-full px-2 py-[2px] text-[10px] font-semibold ring-1"
            :class="job.enabled ? 'bg-primary/8 text-primary ring-primary/20' : 'bg-muted text-muted-foreground ring-border/40'"
          >
            {{ job.enabled ? '运行中' : '已停用' }}
          </span>
        </div>
        <p class="text-[11px] text-muted-foreground/80 ml-9">
          {{ scheduleKindLabel(job.scheduleKind) }} · {{ scheduleDetail(job) }}
        </p>
        <p class="text-[11px] mt-1 ml-9" :class="job.enabled ? 'text-muted-foreground/80' : 'text-muted-foreground/50'">
          <template v-if="job.enabled && job.nextRunAt">
            下次运行 <strong class="text-foreground font-semibold">{{ formatNextRun(job.nextRunAt) }}</strong>
          </template>
          <template v-else-if="!job.enabled">已暂停</template>
          <template v-else>—</template>
        </p>
      </div>
    </div>
  </section>
</template>
