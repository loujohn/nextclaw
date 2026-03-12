<script setup lang="ts">
import { formatScheduleSummary } from "~~/shared/ui-models";
import { Search, RotateCcw, ChevronRight, ChevronLeft, Sparkles, Plus, X } from "lucide-vue-next";

type EmployeeResponse = {
  id: string;
  name: string;
  code: string;
  description: string;
  status: string;
  skills: Array<{ skillName: string }>;
  schedule?: { scheduleKind: string; nextRunAt?: string | null } | null;
  latestRun?: { status: string; summary: string } | null;
  health: {
    hasSkills: boolean;
    hasSchedule: boolean;
    lastStatus: string;
  };
};

type SkillOption = {
  name: string;
  statusLabel: string;
  usageCount: number;
  enabled: boolean;
  purpose: string;
  categoryLabel: string;
};

type EmployeeListPayload = { ok: boolean; data: EmployeeResponse[] };
type SkillListPayload = { ok: boolean; data: SkillOption[] };

const { data: employeePayload, refresh } = await useFetch<EmployeeListPayload>("/api/employees");
const { data: skillPayload } = await useFetch<SkillListPayload>("/api/skills");

const showCreator = ref(false);
const step = ref(0);
const query = ref("");
const form = reactive({
  name: "",
  code: "",
  description: "",
  systemPrompt: "",
  skillNames: [] as string[],
  scheduleKind: "cron",
  cronExpr: "0 18 * * *",
  everyMs: 1800000
});
const creating = ref(false);
const createError = ref("");
const touched = reactive({ name: false });

const employees = computed(() => employeePayload.value?.data ?? []);
const skills = computed(() => skillPayload.value?.data.filter((s) => s.enabled || s.statusLabel !== "已停用") ?? []);
const filteredEmployees = computed(() => {
  const kw = query.value.trim().toLowerCase();
  if (!kw) return employees.value;
  return employees.value.filter((e) =>
    [e.name, e.code, e.description].filter(Boolean).some((t) => t.toLowerCase().includes(kw))
  );
});

const steps = [
  { title: "基础信息", desc: "定义员工职责与角色边界" },
  { title: "技能选择", desc: "绑定当前可用的能力集合" },
  { title: "自动任务", desc: "配置它何时自动开始工作" }
];

async function createEmployee() {
  creating.value = true;
  createError.value = "";
  try {
    const code = form.code.trim() || createEmployeeCode(form.name);
    const created = await $fetch<{ ok: boolean; data: { id: string } }>("/api/employees", {
      method: "POST",
      body: { ...form, code }
    });
    resetForm();
    showCreator.value = false;
    await refresh();
    await navigateTo(`/employees/${created.data.id}`);
  } catch (error) {
    createError.value = error instanceof Error ? error.message : String(error);
  } finally {
    creating.value = false;
  }
}

function nextStep() { step.value = Math.min(step.value + 1, steps.length - 1); }
function previousStep() { step.value = Math.max(step.value - 1, 0); }
function resetForm() {
  step.value = 0;
  touched.name = false;
  Object.assign(form, { name: "", code: "", description: "", systemPrompt: "", skillNames: [], scheduleKind: "cron", cronExpr: "0 18 * * *", everyMs: 1800000 });
}
function createEmployeeCode(name: string): string {
  const n = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return n || `employee-${Date.now().toString().slice(-6)}`;
}

function resolveHealth(e: EmployeeResponse): { label: string; cls: string } {
  if (e.latestRun?.status === "failed") return { label: "执行失败", cls: "bg-destructive/10 text-destructive" };
  if (!e.health.hasSkills) return { label: "待绑定技能", cls: "bg-warning/10 text-warning-foreground" };
  if (!e.health.hasSchedule) return { label: "待配置任务", cls: "bg-muted text-muted-foreground" };
  return { label: "运行健康", cls: "bg-primary/10 text-primary" };
}
</script>

<template>
  <div class="mx-auto max-w-6xl space-y-6 p-6 lg:p-8">
    <!-- Header -->
    <div class="hero-section flex items-start justify-between gap-4">
      <div class="relative space-y-1">
        <span class="section-label">员工管理</span>
        <h1 class="font-display text-3xl font-bold tracking-tight">员工中心</h1>
        <p class="text-sm text-muted-foreground">创建、管理和运营你的数字员工团队。</p>
      </div>
      <button class="btn-primary shrink-0" @click="showCreator = true; resetForm()">
        <Plus class="h-4 w-4" :stroke-width="2" />
        创建员工
      </button>
    </div>

    <!-- Search -->
    <div class="flex items-center gap-4">
      <label class="flex flex-1 items-center gap-2 rounded-lg border border-input bg-card px-3 py-2.5 transition-all duration-150 focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-primary/10">
        <Search class="h-4 w-4 text-muted-foreground" :stroke-width="1.8" />
        <input
          v-model="query"
          placeholder="搜索名称、编码或职责…"
          class="w-full border-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </label>
      <p class="shrink-0 text-sm text-muted-foreground">{{ filteredEmployees.length }} 名员工</p>
    </div>

    <!-- Employee Grid -->
    <div class="stagger-in grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <NuxtLink
        v-for="emp in filteredEmployees"
        :key="emp.id"
        :to="`/employees/${emp.id}`"
        class="group flex flex-col rounded-xl border border-border bg-card p-4 shadow-sm transition-all duration-200 hover:border-primary/20 hover:shadow-md hover:-translate-y-0.5"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <h3 class="text-base font-semibold group-hover:text-primary transition-colors">{{ emp.name }}</h3>
            <p class="text-xs text-muted-foreground font-mono">{{ emp.code }}</p>
          </div>
          <span class="shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold" :class="resolveHealth(emp).cls">
            {{ resolveHealth(emp).label }}
          </span>
        </div>

        <p class="mt-2 flex-1 line-clamp-2 text-sm text-muted-foreground">{{ emp.description || "未填写职责说明" }}</p>

        <div class="mt-3 flex flex-wrap gap-1.5">
          <span v-for="skill in emp.skills.slice(0, 3)" :key="skill.skillName" class="rounded-full bg-primary/8 px-2 py-0.5 text-[11px] font-medium text-primary">
            {{ skill.skillName }}
          </span>
          <span v-if="emp.skills.length > 3" class="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">+{{ emp.skills.length - 3 }}</span>
          <span v-if="emp.skills.length === 0" class="text-[11px] text-muted-foreground">无技能</span>
        </div>

        <div class="mt-3 flex items-center justify-between border-t border-border/60 pt-3 text-[11px] text-muted-foreground">
          <span>{{ formatScheduleSummary(emp.schedule ?? null) }}</span>
          <span class="font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
            进入 →
          </span>
        </div>
      </NuxtLink>

      <!-- Empty -->
      <div
        v-if="filteredEmployees.length === 0"
        class="col-span-full flex flex-col items-center rounded-2xl border border-dashed border-border bg-muted/10 px-6 py-12 text-center"
      >
        <div class="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/5">
          <Sparkles class="h-7 w-7 text-primary/30" :stroke-width="1.5" />
        </div>
        <p class="font-medium">还没有员工</p>
        <p class="mt-1 max-w-xs text-sm text-muted-foreground">点击右上角"创建员工"按钮，三步创建你的第一个数字员工。</p>
        <button class="btn-primary mt-4" @click="showCreator = true; resetForm()">
          <Plus class="h-4 w-4" :stroke-width="2" />
          创建员工
        </button>
      </div>
    </div>

    <!-- Creator Slide-over -->
    <Teleport to="body">
      <Transition name="slide-over">
        <div v-if="showCreator" class="fixed inset-0 z-50 flex justify-end">
          <div class="absolute inset-0 bg-foreground/20 backdrop-blur-sm" @click="showCreator = false" />
          <div class="slide-over-panel relative w-full max-w-md overflow-y-auto bg-card shadow-2xl">
            <div class="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card/95 px-6 py-4 backdrop-blur-sm">
              <div>
                <span class="section-label">新建员工</span>
                <h2 class="mt-0.5 text-lg font-semibold">三步创建</h2>
              </div>
              <button class="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" @click="showCreator = false">
                <X class="h-5 w-5" :stroke-width="1.8" />
              </button>
            </div>

            <div class="p-6">
              <!-- Step Tabs -->
              <div class="mb-6 flex gap-2">
                <button
                  v-for="(s, i) in steps"
                  :key="s.title"
                  type="button"
                  class="flex flex-1 flex-col items-center gap-1 rounded-lg p-2.5 text-center transition-all"
                  :class="step === i ? 'bg-primary/5 ring-1 ring-primary/20' : 'hover:bg-muted/50'"
                  @click="step = i"
                >
                  <span
                    class="flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold"
                    :class="step === i ? 'bg-primary text-primary-foreground' : step > i ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'"
                  >{{ i + 1 }}</span>
                  <span class="text-[11px] font-medium" :class="step === i ? 'text-foreground' : 'text-muted-foreground'">{{ s.title }}</span>
                </button>
              </div>

              <!-- Form -->
              <form class="space-y-4" @submit.prevent="step === steps.length - 1 ? createEmployee() : nextStep()">
                <!-- Step 0: Basic Info -->
                <div v-if="step === 0" class="space-y-3">
                  <label class="block space-y-1.5">
                    <span class="text-sm font-medium">名称 <span class="text-destructive">*</span></span>
                    <input
                      v-model="form.name"
                      required
                      placeholder="例如：项目管理助手"
                      class="input-field"
                      :class="touched.name && !form.name.trim() && 'border-destructive/50 focus:border-destructive focus:ring-destructive/10'"
                      @blur="touched.name = true"
                    />
                    <p v-if="touched.name && !form.name.trim()" class="text-xs text-destructive">请输入员工名称</p>
                  </label>
                  <label class="block space-y-1.5">
                    <span class="text-sm font-medium">系统编码<span class="ml-1 text-xs text-muted-foreground">可选</span></span>
                    <input v-model="form.code" placeholder="默认按名称自动生成" class="input-field" />
                  </label>
                  <label class="block space-y-1.5">
                    <span class="text-sm font-medium">职责描述</span>
                    <textarea v-model="form.description" rows="3" placeholder="描述它负责哪些业务结果…" class="input-field" />
                  </label>
                  <label class="block space-y-1.5">
                    <span class="text-sm font-medium">系统提示词</span>
                    <textarea v-model="form.systemPrompt" rows="4" placeholder="定义角色、人设、输出风格和边界…" class="input-field" />
                  </label>
                </div>

                <!-- Step 1: Skills -->
                <div v-else-if="step === 1" class="space-y-3">
                  <div class="flex items-start gap-2 rounded-lg bg-primary/5 p-3 text-sm text-primary">
                    <Sparkles class="mt-0.5 h-4 w-4 shrink-0" :stroke-width="1.8" />
                    <p>优先选择已启用且职责明确的技能。</p>
                  </div>
                  <label
                    v-for="skill in skills"
                    :key="skill.name"
                    class="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 transition-all hover:bg-muted/30"
                    :class="form.skillNames.includes(skill.name) && 'border-primary/30 bg-primary/5'"
                  >
                    <input v-model="form.skillNames" type="checkbox" :value="skill.name" class="mt-0.5 h-4 w-4 accent-primary" />
                    <div class="min-w-0">
                      <div class="flex items-center gap-2">
                        <p class="text-sm font-medium">{{ skill.name }}</p>
                        <span class="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">{{ skill.categoryLabel }}</span>
                      </div>
                      <p class="mt-0.5 text-xs text-muted-foreground">{{ skill.purpose }}</p>
                    </div>
                  </label>
                </div>

                <!-- Step 2: Automation -->
                <div v-else class="space-y-3">
                  <div class="grid gap-2">
                    <label
                      v-for="opt in [
                        { value: 'cron', title: '每日定时', desc: '适合日报、巡检、总结和推送' },
                        { value: 'every', title: '固定间隔', desc: '适合持续巡检或短周期同步' },
                        { value: 'heartbeat', title: '心跳巡检', desc: '适合轻量检查和持续状态感知' }
                      ]"
                      :key="opt.value"
                      class="flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-3 transition-all"
                      :class="form.scheduleKind === opt.value ? 'border-primary/30 bg-primary/5' : 'border-border hover:bg-muted/30'"
                    >
                      <input v-model="form.scheduleKind" type="radio" :value="opt.value" class="mt-0.5 h-4 w-4 accent-primary" />
                      <div>
                        <p class="text-sm font-medium">{{ opt.title }}</p>
                        <p class="text-xs text-muted-foreground">{{ opt.desc }}</p>
                      </div>
                    </label>
                  </div>
                  <label v-if="form.scheduleKind === 'cron'" class="block space-y-1.5">
                    <span class="text-sm font-medium">Cron 表达式</span>
                    <input v-model="form.cronExpr" class="input-field font-mono" />
                  </label>
                  <label v-else class="block space-y-1.5">
                    <span class="text-sm font-medium">间隔毫秒</span>
                    <input v-model.number="form.everyMs" type="number" min="1000" class="input-field" />
                  </label>
                </div>

                <p v-if="createError" class="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{{ createError }}</p>

                <div class="flex items-center justify-between gap-2 border-t border-border pt-4">
                  <button v-if="step > 0" type="button" class="btn-ghost" @click="previousStep">
                    <ChevronLeft class="h-3.5 w-3.5" />
                    上一步
                  </button>
                  <span v-else />
                  <button class="btn-primary" :disabled="creating || (step === 0 && !form.name.trim())">
                    {{ step === steps.length - 1 ? (creating ? "创建中..." : "创建并进入工作台") : "下一步" }}
                    <ChevronRight v-if="step < steps.length - 1" class="h-3.5 w-3.5" />
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>
