<script setup lang="ts">
import { ArrowUpCircle, ChevronDown } from "lucide-vue-next";
import type { AutomationSummaryView } from "~/composables/useEmployeeDetail";
import { pickAvatarGradient } from "~~/shared/avatar-utils";

const props = defineProps<{
  employee: {
    id: string;
    name: string;
    code: string;
    description: string;
    departmentId?: string | null;
    skills: Array<{
      id: string;
      skillName: string;
      version: string | null;
      latestVersion: string | null;
      hasUpdate: boolean;
      installMissing: boolean;
    }>;
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

const emit = defineEmits<{
  skillUpgraded: [];
}>();

const avatarGradient = computed(() => pickAvatarGradient(props.employee.id));
const avatarChar = computed(() => props.employee.name.charAt(0));
const isRunning = computed(() =>
  props.employee.recentRuns.some((r) => r.status === "running")
);

const upgradingSkill = ref<string | null>(null);
const upgradeError = ref<string | null>(null);
const upgradingAll = ref(false);

// 单个升级确认弹窗
const confirmSingle = ref(false);
const pendingSingleSkill = ref<string | null>(null);

function askUpgradeSkill(skillName: string) {
  pendingSingleSkill.value = skillName;
  upgradeError.value = null;
  confirmSingle.value = true;
}

async function doUpgradeSkill() {
  const skillName = pendingSingleSkill.value;
  if (!skillName) return;
  upgradingSkill.value = skillName;
  try {
    await $fetch(`/api/employees/${props.employee.id}/skills/${skillName}/upgrade`, { method: "POST" });
    confirmSingle.value = false;
    emit("skillUpgraded");
  } catch (e: unknown) {
    upgradeError.value = e instanceof Error ? e.message : "升级失败";
  } finally {
    upgradingSkill.value = null;
  }
}

// 升级全部确认弹窗
const confirmAll = ref(false);

function askUpgradeAll() {
  upgradeError.value = null;
  confirmAll.value = true;
}

async function doUpgradeAllSkills() {
  const updatableSkills = props.employee.skills.filter(s => s.hasUpdate);
  upgradingAll.value = true;
  try {
    for (const skill of updatableSkills) {
      upgradingSkill.value = skill.skillName;
      await $fetch(`/api/employees/${props.employee.id}/skills/${skill.skillName}/upgrade`, { method: "POST" });
    }
    confirmAll.value = false;
    emit("skillUpgraded");
  } catch (e: unknown) {
    upgradeError.value = e instanceof Error ? e.message : "升级失败";
  } finally {
    upgradingSkill.value = null;
    upgradingAll.value = false;
  }
}

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

const updatableCount = computed(() => props.employee.skills.filter((s) => s.hasUpdate).length);

const SKILL_PREVIEW_COUNT = 6;
const showAllSkills = ref(false);
const visibleSkills = computed(() =>
  showAllSkills.value ? props.employee.skills : props.employee.skills.slice(0, SKILL_PREVIEW_COUNT)
);
const hiddenSkillCount = computed(() => Math.max(0, props.employee.skills.length - SKILL_PREVIEW_COUNT));
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
        <div class="flex items-center justify-between mb-2">
          <p class="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">已绑定技能</p>
          <div v-if="updatableCount > 0" class="flex items-center gap-2">
            <span class="text-[10px] font-semibold text-amber-500">{{ updatableCount }} 个可升级</span>
            <button
              class="flex items-center gap-0.5 rounded px-1.5 py-[2px] text-[10px] font-semibold bg-amber-50 text-amber-600 ring-1 ring-amber-200/80 hover:bg-amber-100 transition-colors disabled:opacity-40"
              :disabled="upgradingAll"
              @click="askUpgradeAll"
            >
              <ArrowUpCircle class="h-3 w-3" :class="upgradingAll ? 'animate-spin' : ''" />
              升级全部
            </button>
          </div>
        </div>
        <div v-if="employee.skills.length > 0" class="flex flex-wrap gap-[5px]">
          <div
            v-for="skill in visibleSkills"
            :key="skill.id"
            class="group relative flex items-center gap-1 rounded-md px-2.5 py-[3px] text-[11px] font-medium ring-1"
            :class="skill.installMissing
              ? 'bg-red-50/80 text-red-600 ring-red-200/80'
              : skill.hasUpdate
                ? 'bg-amber-50/80 text-amber-700 ring-amber-200/80'
                : 'bg-indigo-50/80 text-indigo-600 ring-indigo-100/80'"
          >
            <span>{{ skillDisplayNames.get(skill.skillName) || skill.skillName }}</span>
            <span v-if="skill.version" class="opacity-50 font-normal">v{{ skill.version }}</span>
            <!-- 全局已删除标签 -->
            <span
              v-if="skill.installMissing"
              class="ml-0.5 rounded px-1 py-[1px] text-[9px] font-bold bg-red-100 text-red-500 ring-1 ring-red-200/80 leading-none"
            >已删除</span>
            <button
              v-else-if="skill.hasUpdate"
              class="ml-0.5 rounded text-amber-500 hover:text-amber-700 transition-colors disabled:opacity-40"
              :disabled="upgradingSkill === skill.skillName"
              :title="`升级到 v${skill.latestVersion}`"
              @click.stop="askUpgradeSkill(skill.skillName)"
            >
              <ArrowUpCircle
                class="h-3.5 w-3.5"
                :class="upgradingSkill === skill.skillName ? 'animate-spin' : ''"
              />
            </button>
          </div>
          <!-- 展开/折叠按钮 -->
          <button
            v-if="hiddenSkillCount > 0 || showAllSkills"
            class="flex items-center gap-0.5 rounded-md px-2.5 py-[3px] text-[11px] font-medium ring-1 bg-muted/60 text-muted-foreground ring-border/40 hover:bg-muted transition-colors"
            @click="showAllSkills = !showAllSkills"
          >
            <ChevronDown
              class="h-3 w-3 transition-transform"
              :class="showAllSkills ? 'rotate-180' : ''"
            />
            {{ showAllSkills ? '收起' : `+${hiddenSkillCount}` }}
          </button>
        </div>
        <p v-else class="text-[11px] text-muted-foreground/60">还没有绑定技能</p>
        <p v-if="upgradeError" class="mt-1.5 text-[11px] text-destructive">{{ upgradeError }}</p>
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

  <!-- 单个技能升级确认弹窗 -->
  <SharedConfirmDialog
    :open="confirmSingle"
    title="升级技能"
    :message="`确定要将技能「${skillDisplayNames.get(pendingSingleSkill ?? '') || pendingSingleSkill}」升级到 v${employee.skills.find(s => s.skillName === pendingSingleSkill)?.latestVersion} 吗？`"
    confirm-label="升级"
    confirming-label="升级中..."
    :confirming="upgradingSkill !== null"
    :error="upgradeError ?? undefined"
    @confirm="doUpgradeSkill"
    @cancel="confirmSingle = false"
  />

  <!-- 升级全部确认弹窗 -->
  <SharedConfirmDialog
    :open="confirmAll"
    title="升级全部技能"
    :message="`确定要升级全部 ${updatableCount} 个可升级的技能吗？`"
    confirm-label="全部升级"
    confirming-label="升级中..."
    :confirming="upgradingAll"
    :error="upgradeError ?? undefined"
    @confirm="doUpgradeAllSkills"
    @cancel="confirmAll = false"
  />
</template>
