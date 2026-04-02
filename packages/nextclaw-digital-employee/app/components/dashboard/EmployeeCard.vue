<script setup lang="ts">
import { pickAvatarGradient } from "~~/shared/avatar-utils";

const props = defineProps<{
  employee: {
    id: string;
    name: string;
    code: string;
    description: string;
    departmentId: string | null;
    skills: Array<{ skillName: string }>;
    latestRun?: { status: string; summary: string; finishedAt: string | null } | null;
    schedule?: { scheduleKind: string; nextRunAt?: string | null } | null;
  };
  deptName: string | null;
  stats: {
    todayRunCount: number;
    totalRunCount: number;
    todaySuccessRate: number;
  };
  skillDisplayNames: Map<string, string>;
}>();

const emit = defineEmits<{ click: [] }>();

const avatarGradient = computed(() => pickAvatarGradient(props.employee.id));

const avatarChar = computed(() => props.employee.name.charAt(0));
const isRunning = computed(() => props.employee.latestRun?.status === "running");

const scheduleLabel = computed(() => {
  if (!props.employee.schedule) return "未配置调度";
  const kind = props.employee.schedule.scheduleKind;
  if (kind === "cron") return "定时运行";
  if (kind === "every") return "周期运行";
  if (kind === "heartbeat") return "心跳运行";
  return "已配置";
});

function getSkillDisplayName(skillName: string): string {
  return props.skillDisplayNames.get(skillName) || skillName;
}
</script>

<template>
  <div
    class="group rounded-xl border border-border/50 bg-gradient-to-br from-violet-50/60 via-white to-indigo-50/40 p-4 transition-all duration-300 hover:shadow-[0_6px_24px_rgba(99,102,241,0.1)] hover:border-primary/20 cursor-pointer"
    @click="emit('click')"
  >
    <div class="flex items-center gap-3 mb-3">
      <div
        class="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-lg font-extrabold text-white shadow-md ring-2 ring-white/80"
        :style="{ background: avatarGradient }"
      >
        {{ avatarChar }}
      </div>
      <div class="min-w-0 flex-1">
        <p class="text-[15px] font-bold truncate">{{ employee.name }}</p>
        <p class="text-[11px] text-muted-foreground/80 truncate">{{ deptName ?? '未分配部门' }} · {{ scheduleLabel }}</p>
      </div>
      <span
        class="flex items-center gap-[5px] rounded-full px-2.5 py-[3px] text-[11px] font-semibold shadow-sm"
        :class="isRunning ? 'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200/50' : 'bg-muted/80 text-muted-foreground ring-1 ring-border/40'"
      >
        <span
          class="h-[7px] w-[7px] rounded-full"
          :class="isRunning ? 'bg-emerald-500 animate-pulse' : 'bg-muted-foreground/30'"
        />
        {{ isRunning ? '运行中' : '空闲' }}
      </span>
    </div>

    <div v-if="employee.skills.length > 0" class="flex flex-wrap gap-[5px] mb-3">
      <span
        v-for="skill in employee.skills"
        :key="skill.skillName"
        class="rounded-md bg-indigo-50/80 px-2.5 py-[3px] text-[11px] font-medium text-indigo-600 ring-1 ring-indigo-100/80"
      >
        {{ getSkillDisplayName(skill.skillName) }}
      </span>
    </div>

    <div class="grid grid-cols-2 gap-2 mt-3">
      <div class="rounded-lg bg-white/80 border border-border/30 px-2.5 py-2 backdrop-blur-sm">
        <p class="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70 mb-0.5">今日运行</p>
        <p class="text-[14px] font-bold tabular-nums">{{ stats.todayRunCount }} <span class="text-[10px] font-medium text-muted-foreground">次</span></p>
      </div>
      <div class="rounded-lg bg-white/80 border border-border/30 px-2.5 py-2 backdrop-blur-sm">
        <p class="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70 mb-0.5">累计运行</p>
        <p class="text-[14px] font-bold tabular-nums">{{ stats.totalRunCount }} <span class="text-[10px] font-medium text-muted-foreground">次</span></p>
      </div>
      <div class="rounded-lg bg-white/80 border border-border/30 px-2.5 py-2 backdrop-blur-sm">
        <p class="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70 mb-0.5">绑定技能</p>
        <p class="text-[14px] font-bold tabular-nums">{{ employee.skills.length }} <span class="text-[10px] font-medium text-muted-foreground">个</span></p>
      </div>
      <div class="rounded-lg bg-white/80 border border-border/30 px-2.5 py-2 backdrop-blur-sm">
        <p class="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70 mb-0.5">成功率</p>
        <p class="text-[14px] font-bold tabular-nums">{{ stats.todaySuccessRate }}<span class="text-[10px] font-medium text-muted-foreground">%</span></p>
      </div>
    </div>
  </div>
</template>
