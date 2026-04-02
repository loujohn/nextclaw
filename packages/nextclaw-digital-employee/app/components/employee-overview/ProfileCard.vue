<script setup lang="ts">
import type { AutomationSummaryView } from "~/composables/useEmployeeDetail";
import { pickAvatarGradient } from "~~/shared/avatar-utils";

const props = defineProps<{
  employee: {
    id: string;
    name: string;
    code: string;
    description: string;
    departmentId?: string | null;
    skills: Array<{ id: string; skillName: string }>;
    health: {
      hasPrompt: boolean;
      hasSkills: boolean;
    };
    automationSummary: AutomationSummaryView;
    recentRuns: Array<{ id: string; status: string }>;
  };
  deptName: string | null;
  skillDisplayNames: Map<string, string>;
  nextJobRun: { name: string; nextRunAt: string } | null;
}>();

const avatarGradient = computed(() => pickAvatarGradient(props.employee.id));

const avatarChar = computed(() => props.employee.name.charAt(0));

const isRunning = computed(() =>
  props.employee.recentRuns.some((r) => r.status === "running")
);

function formatNextRun(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
  return isToday ? `今天 ${time}` : `${d.toLocaleDateString("zh-CN", { month: "short", day: "numeric" })} ${time}`;
}

const healthChecks = computed(() => [
  {
    ok: props.employee.health.hasPrompt,
    label: `系统提示词 ${props.employee.health.hasPrompt ? "已配置" : "待补充"}`,
  },
  {
    ok: props.employee.health.hasSkills,
    label: `技能 ${props.employee.health.hasSkills ? `就绪（${props.employee.skills.length} 个）` : "待绑定"}`,
  },
  {
    ok: props.employee.automationSummary.healthOk,
    label: `定时任务 · ${props.employee.automationSummary.countLabel} · ${props.employee.automationSummary.statusLabel}`,
  },
]);
</script>

<template>
  <div class="rounded-2xl border border-border/60 bg-card overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
    <div class="flex items-center justify-between px-[18px] py-3.5 border-b border-border/60">
      <h3 class="text-sm font-bold">员工信息</h3>
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

    <div class="p-[18px] space-y-4">
      <!-- Avatar + Name -->
      <div class="flex items-center gap-3">
        <div
          class="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-lg font-extrabold text-white shadow-md ring-2 ring-white/80"
          :style="{ background: avatarGradient }"
        >
          {{ avatarChar }}
        </div>
        <div class="min-w-0 flex-1">
          <p class="text-[15px] font-bold truncate">{{ employee.name }}</p>
          <p class="text-[11px] text-muted-foreground/80 truncate">{{ deptName ?? '未分配部门' }} · {{ employee.code }}</p>
        </div>
      </div>

      <!-- Health Checks -->
      <div>
        <p class="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60 mb-2">状态检查</p>
        <div class="space-y-2">
          <div
            v-for="(check, i) in healthChecks"
            :key="i"
            class="flex items-center gap-2 text-[12px]"
          >
            <span
              class="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full text-[10px] font-bold ring-1"
              :class="check.ok ? 'bg-emerald-50 text-emerald-500 ring-emerald-200/50' : 'bg-amber-50 text-amber-500 ring-amber-200/50'"
            >
              {{ check.ok ? '✓' : '!' }}
            </span>
            <span class="text-muted-foreground/90">{{ check.label }}</span>
          </div>
        </div>
      </div>

      <!-- Skills -->
      <div>
        <p class="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60 mb-2">已绑定技能</p>
        <div v-if="employee.skills.length > 0" class="flex flex-wrap gap-[5px]">
          <span
            v-for="skill in employee.skills"
            :key="skill.id"
            class="rounded-md bg-indigo-50/80 px-2.5 py-[3px] text-[11px] font-medium text-indigo-600 ring-1 ring-indigo-100/80"
          >
            {{ skillDisplayNames.get(skill.skillName) || skill.skillName }}
          </span>
        </div>
        <p v-else class="text-[11px] text-muted-foreground/60">还没有绑定技能</p>
      </div>

      <!-- Next Run -->
      <div v-if="nextJobRun" class="rounded-lg bg-gradient-to-r from-primary/[0.04] to-transparent border border-border/40 px-3 py-2.5">
        <p class="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60 mb-1">下次运行</p>
        <p class="text-[12px] font-bold">
          {{ formatNextRun(nextJobRun.nextRunAt) }}
          <span class="font-medium text-muted-foreground/80"> · {{ nextJobRun.name }}</span>
        </p>
      </div>
    </div>
  </div>
</template>
