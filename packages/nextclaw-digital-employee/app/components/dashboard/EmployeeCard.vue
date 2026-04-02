<script setup lang="ts">
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

const AVATAR_GRADIENTS = [
  "linear-gradient(135deg, #6366f1, #8b5cf6)",
  "linear-gradient(135deg, #ec4899, #f472b6)",
  "linear-gradient(135deg, #06b6d4, #22d3ee)",
  "linear-gradient(135deg, #f59e0b, #fbbf24)",
  "linear-gradient(135deg, #8b5cf6, #a78bfa)",
  "linear-gradient(135deg, #10b981, #34d399)",
];

const avatarGradient = computed(() => {
  const hash = props.employee.id.charCodeAt(0) + props.employee.id.charCodeAt(props.employee.id.length - 1);
  return AVATAR_GRADIENTS[hash % AVATAR_GRADIENTS.length];
});

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
    class="rounded-[10px] border border-border bg-gradient-to-br from-violet-50/80 to-indigo-50/60 p-4 transition-shadow duration-200 hover:shadow-[0_4px_16px_rgba(99,102,241,0.08)] cursor-pointer"
    @click="emit('click')"
  >
    <div class="flex items-center gap-3 mb-3">
      <div
        class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-lg font-extrabold text-white"
        :style="{ background: avatarGradient }"
      >
        {{ avatarChar }}
      </div>
      <div class="min-w-0 flex-1">
        <p class="text-[15px] font-bold truncate">{{ employee.name }}</p>
        <p class="text-[11px] text-muted-foreground truncate">{{ deptName ?? '未分配部门' }} · {{ scheduleLabel }}</p>
      </div>
      <span
        class="flex items-center gap-[5px] rounded-full px-2.5 py-[3px] text-[11px] font-semibold"
        :class="isRunning ? 'bg-[#ecfdf5] text-[#10b981]' : 'bg-muted text-muted-foreground'"
      >
        <span
          class="h-[7px] w-[7px] rounded-full"
          :class="isRunning ? 'bg-[#10b981] animate-pulse' : 'bg-muted-foreground/40'"
        />
        {{ isRunning ? '运行中' : '空闲' }}
      </span>
    </div>

    <div v-if="employee.skills.length > 0" class="flex flex-wrap gap-[5px] mb-3">
      <span
        v-for="skill in employee.skills"
        :key="skill.skillName"
        class="rounded-md bg-[#eef2ff] px-2.5 py-[3px] text-[11px] font-medium text-[#6366f1]"
      >
        {{ getSkillDisplayName(skill.skillName) }}
      </span>
    </div>

    <div class="grid grid-cols-2 gap-2 mt-3">
      <div class="rounded-lg bg-white border border-border/40 px-2.5 py-2">
        <p class="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/80 mb-0.5">今日运行</p>
        <p class="text-[13px] font-bold">{{ stats.todayRunCount }} 次</p>
      </div>
      <div class="rounded-lg bg-white border border-border/40 px-2.5 py-2">
        <p class="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/80 mb-0.5">累计运行</p>
        <p class="text-[13px] font-bold">{{ stats.totalRunCount }} 次</p>
      </div>
      <div class="rounded-lg bg-white border border-border/40 px-2.5 py-2">
        <p class="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/80 mb-0.5">绑定技能</p>
        <p class="text-[13px] font-bold">{{ employee.skills.length }} 个</p>
      </div>
      <div class="rounded-lg bg-white border border-border/40 px-2.5 py-2">
        <p class="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/80 mb-0.5">成功率</p>
        <p class="text-[13px] font-bold">{{ stats.todaySuccessRate }}%</p>
      </div>
    </div>
  </div>
</template>
