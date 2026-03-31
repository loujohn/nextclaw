<script setup lang="ts">
import { Pencil, Trash2 } from "lucide-vue-next";

type EmployeeCardData = {
  name: string;
  description: string;
  enabledJobsCount: number;
  latestRun?: { finishedAt: string | null } | null;
};

const props = defineProps<{
  employee: EmployeeCardData;
  deptName: string | null;
}>();

const emit = defineEmits<{
  click: [];
  edit: [];
  delete: [];
}>();

const AVATAR_GRADIENTS = [
  { from: "#6366f1", to: "#818cf8" },
  { from: "#f97316", to: "#fb923c" },
  { from: "#06b6d4", to: "#22d3ee" },
  { from: "#ec4899", to: "#f472b6" },
  { from: "#10b981", to: "#34d399" },
  { from: "#8b5cf6", to: "#a78bfa" },
  { from: "#ef4444", to: "#f87171" },
  { from: "#0ea5e9", to: "#38bdf8" },
];

function getAvatarGradient(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  const g = AVATAR_GRADIENTS[hash % AVATAR_GRADIENTS.length]!;
  return `linear-gradient(135deg, ${g.from}, ${g.to})`;
}

type ActivityStatus = { text: string; color: string; dotColor: string };

function getActivityStatus(emp: EmployeeCardData): ActivityStatus {
  const finishedAt = emp.latestRun?.finishedAt;
  if (!finishedAt) {
    return { text: "离线", color: "#94a3b8", dotColor: "#94a3b8" };
  }
  const diffMs = Date.now() - new Date(finishedAt).getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);

  if (diffMins <= 5) return { text: "刚刚活跃", color: "#22c55e", dotColor: "#22c55e" };
  if (diffMins < 60) return { text: `${diffMins}分钟前`, color: "#22c55e", dotColor: "#86efac" };
  if (diffHours < 24) return { text: `${diffHours}小时前`, color: "#eab308", dotColor: "#fde047" };
  return { text: "超过一天未活跃", color: "#94a3b8", dotColor: "#cbd5e1" };
}

function getDescription(emp: EmployeeCardData): string {
  if (emp.description?.trim()) return emp.description.trim();
  if (emp.enabledJobsCount > 0) return `负责 ${emp.enabledJobsCount} 个活跃任务`;
  return "等待分配工作";
}

const DEPT_TAG_COLOR_POOL = [
  { bg: "rgba(99,102,241,0.08)", text: "#6366f1" },
  { bg: "rgba(236,72,153,0.08)", text: "#ec4899" },
  { bg: "rgba(245,158,11,0.08)", text: "#f59e0b" },
  { bg: "rgba(6,182,212,0.08)", text: "#06b6d4" },
  { bg: "rgba(16,185,129,0.08)", text: "#10b981" },
  { bg: "rgba(139,92,246,0.08)", text: "#8b5cf6" },
];

function getDeptTagColor(deptName: string): { bg: string; text: string } {
  let hash = 0;
  for (let i = 0; i < deptName.length; i++) {
    hash = (hash + deptName.charCodeAt(i)) % DEPT_TAG_COLOR_POOL.length;
  }
  return DEPT_TAG_COLOR_POOL[hash]!;
}

const activity = computed(() => getActivityStatus(props.employee));
const description = computed(() => getDescription(props.employee));
const avatarGradient = computed(() => getAvatarGradient(props.employee.name));
const deptTagStyle = computed(() => {
  if (!props.deptName) return null;
  return getDeptTagColor(props.deptName);
});
</script>

<template>
  <div class="employee-list-card" @click="emit('click')">
    <div class="employee-list-card__avatar" :style="{ background: avatarGradient }">
      <span class="employee-list-card__avatar-text">{{ employee.name.charAt(0) }}</span>
      <span class="employee-list-card__avatar-dot" :style="{ background: activity.dotColor }" />
    </div>

    <div class="employee-list-card__content">
      <div class="employee-list-card__header">
        <span class="employee-list-card__name">{{ employee.name }}</span>
        <span
          v-if="deptName && deptTagStyle"
          class="employee-list-card__dept"
          :style="{ background: deptTagStyle.bg, color: deptTagStyle.text }"
        >
          {{ deptName }}
        </span>
      </div>
      <div class="employee-list-card__status" :style="{ color: activity.color }">
        <span class="employee-list-card__status-dot" :style="{ background: activity.dotColor }" />
        {{ activity.text }}
      </div>
      <p class="employee-list-card__desc">{{ description }}</p>
    </div>

    <div class="employee-list-card__actions">
      <button class="employee-list-card__action-btn" title="编辑" @click.stop="emit('edit')">
        <Pencil class="h-4 w-4" :stroke-width="1.8" />
      </button>
      <button class="employee-list-card__action-btn employee-list-card__action-btn--danger" title="删除" @click.stop="emit('delete')">
        <Trash2 class="h-4 w-4" :stroke-width="1.8" />
      </button>
    </div>
  </div>
</template>
