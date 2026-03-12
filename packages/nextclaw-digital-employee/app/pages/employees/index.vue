<script setup lang="ts">
import { formatScheduleSummary } from "~~/shared/ui-models";

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

type EmployeeListPayload = {
  ok: boolean;
  data: EmployeeResponse[];
};

type SkillListPayload = {
  ok: boolean;
  data: SkillOption[];
};

const { data: employeePayload, refresh } = await useFetch<EmployeeListPayload>("/api/employees");
const { data: skillPayload } = await useFetch<SkillListPayload>("/api/skills");

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

const employees = computed(() => employeePayload.value?.data ?? []);
const skills = computed(() => skillPayload.value?.data.filter((skill) => skill.enabled || skill.statusLabel !== "已停用") ?? []);
const filteredEmployees = computed(() => {
  const keyword = query.value.trim().toLowerCase();
  if (!keyword) {
    return employees.value;
  }
  return employees.value.filter((employee) =>
    [employee.name, employee.code, employee.description]
      .filter(Boolean)
      .some((item) => item.toLowerCase().includes(keyword))
  );
});

const steps = [
  { title: "基础信息", description: "定义员工职责与角色边界" },
  { title: "技能选择", description: "绑定当前可用的能力集合" },
  { title: "自动任务", description: "配置它何时自动开始工作" }
];

async function createEmployee() {
  creating.value = true;
  createError.value = "";
  try {
    const code = form.code.trim() || createEmployeeCode(form.name);
    const created = await $fetch<{ ok: boolean; data: { id: string } }>("/api/employees", {
      method: "POST",
      body: {
        ...form,
        code
      }
    });
    resetForm();
    await refresh();
    await navigateTo(`/employees/${created.data.id}`);
  } catch (error) {
    createError.value = error instanceof Error ? error.message : String(error);
  } finally {
    creating.value = false;
  }
}

function nextStep() {
  step.value = Math.min(step.value + 1, steps.length - 1);
}

function previousStep() {
  step.value = Math.max(step.value - 1, 0);
}

function resetForm() {
  step.value = 0;
  form.name = "";
  form.code = "";
  form.description = "";
  form.systemPrompt = "";
  form.skillNames = [];
  form.scheduleKind = "cron";
  form.cronExpr = "0 18 * * *";
  form.everyMs = 1800000;
}

function createEmployeeCode(name: string): string {
  const normalized = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (normalized) {
    return normalized;
  }
  return `employee-${Date.now().toString().slice(-6)}`;
}

function resolveHealthLabel(employee: EmployeeResponse): { label: string; tone: "teal" | "amber" | "danger" | "slate" } {
  if (employee.latestRun?.status === "failed") {
    return { label: "最近执行失败", tone: "danger" };
  }
  if (!employee.health.hasSkills) {
    return { label: "待绑定技能", tone: "amber" };
  }
  if (!employee.health.hasSchedule) {
    return { label: "待配置自动任务", tone: "slate" };
  }
  return { label: "运行健康", tone: "teal" };
}
</script>

<template>
  <main class="app-shell">
    <AppNav />
    <section class="page-panel employee-page-shell">
      <div class="page-heading">
        <div>
          <p class="eyebrow">Employee Center</p>
          <h1>让数字员工像真正的业务角色一样被创建、管理和运营</h1>
          <p class="hero-copy compact">员工中心负责目录管理和创建流程，真正的对话、结果和自动运行都在工作台里完成。</p>
        </div>
      </div>

      <div class="employee-layout">
        <article class="creator-panel">
          <div class="section-header">
            <div>
              <p class="eyebrow">New Employee</p>
              <h2>三步创建一个可工作的员工</h2>
            </div>
            <button class="ghost-link button-reset" type="button" @click="resetForm">重置</button>
          </div>

          <div class="step-tabs" role="tablist" aria-label="创建步骤">
            <button
              v-for="(item, index) in steps"
              :key="item.title"
              type="button"
              class="step-tab"
              :class="{ active: step === index }"
              @click="step = index"
            >
              <span>{{ index + 1 }}</span>
              <div>
                <strong>{{ item.title }}</strong>
                <small>{{ item.description }}</small>
              </div>
            </button>
          </div>

          <form class="creator-form" @submit.prevent="step === steps.length - 1 ? createEmployee() : nextStep()">
            <div v-if="step === 0" class="stack-form">
              <label>
                名称
                <input v-model="form.name" required placeholder="例如：项目管理助手" />
              </label>
              <label>
                系统编码（可选）
                <input v-model="form.code" placeholder="默认会按名称生成" />
              </label>
              <label>
                职责描述
                <textarea v-model="form.description" rows="4" placeholder="描述它负责哪些业务结果，例如日报、巡检、通知或协同。" />
              </label>
              <label>
                系统提示词
                <textarea v-model="form.systemPrompt" rows="6" placeholder="定义角色、人设、输出风格、禁止事项和边界。" />
              </label>
            </div>

            <div v-else-if="step === 1" class="stack-form">
              <div class="helper-banner">
                <AppIcon name="spark" :size="18" />
                <p>优先选择已启用且职责明确的技能，避免把所有技能一次性都塞给同一个员工。</p>
              </div>
              <div class="skill-choice-grid">
                <label v-for="skill in skills" :key="skill.name" class="skill-choice-card elevated">
                  <input v-model="form.skillNames" type="checkbox" :value="skill.name" />
                  <div class="skill-choice-content">
                    <div class="card-row compact">
                      <strong>{{ skill.name }}</strong>
                      <StatusBadge :label="skill.categoryLabel" tone="slate" />
                    </div>
                    <p>{{ skill.purpose }}</p>
                    <span>{{ skill.statusLabel }} · 已被 {{ skill.usageCount }} 名员工使用</span>
                  </div>
                </label>
              </div>
            </div>

            <div v-else class="stack-form">
              <div class="automation-grid">
                <label class="radio-card" :class="{ active: form.scheduleKind === 'cron' }">
                  <input v-model="form.scheduleKind" type="radio" value="cron" />
                  <div>
                    <strong>每日定时</strong>
                    <p>适合日报、巡检、总结和推送。</p>
                  </div>
                </label>
                <label class="radio-card" :class="{ active: form.scheduleKind === 'every' }">
                  <input v-model="form.scheduleKind" type="radio" value="every" />
                  <div>
                    <strong>固定间隔</strong>
                    <p>适合持续巡检或短周期同步。</p>
                  </div>
                </label>
                <label class="radio-card" :class="{ active: form.scheduleKind === 'heartbeat' }">
                  <input v-model="form.scheduleKind" type="radio" value="heartbeat" />
                  <div>
                    <strong>心跳巡检</strong>
                    <p>适合轻量检查和持续状态感知。</p>
                  </div>
                </label>
              </div>

              <label v-if="form.scheduleKind === 'cron'">
                Cron 表达式
                <input v-model="form.cronExpr" />
              </label>
              <label v-else>
                间隔毫秒
                <input v-model.number="form.everyMs" type="number" min="1000" />
              </label>
            </div>

            <p v-if="createError" class="error-text">{{ createError }}</p>
            <div class="form-actions">
              <button v-if="step > 0" class="ghost-link button-reset" type="button" @click="previousStep">上一步</button>
              <button class="primary-button" :disabled="creating || (step === 0 && !form.name.trim())">
                {{ step === steps.length - 1 ? (creating ? "创建中..." : "创建并进入工作台") : "下一步" }}
              </button>
            </div>
          </form>
        </article>

        <section class="catalog-panel">
          <div class="section-header">
            <div>
              <p class="eyebrow">Employees</p>
              <h2>当前员工目录</h2>
            </div>
            <label class="search-field">
              <AppIcon name="spark" :size="16" />
              <input v-model="query" placeholder="搜索名称、编码或职责" />
            </label>
          </div>

          <div class="employee-catalog">
            <NuxtLink v-for="employee in filteredEmployees" :key="employee.id" class="employee-card" :to="`/employees/${employee.id}`">
              <div class="card-row">
                <div>
                  <p class="eyebrow">Employee</p>
                  <h2>{{ employee.name }}</h2>
                  <p class="card-subtitle">{{ employee.code }}</p>
                </div>
                <StatusBadge :label="resolveHealthLabel(employee).label" :tone="resolveHealthLabel(employee).tone" />
              </div>

              <p class="employee-description">{{ employee.description || "未填写职责说明" }}</p>

              <div class="employee-card-meta">
                <div>
                  <span class="metric-label">技能</span>
                  <strong>{{ employee.skills.length }}</strong>
                </div>
                <div>
                  <span class="metric-label">自动任务</span>
                  <strong>{{ formatScheduleSummary(employee.schedule ?? null) }}</strong>
                </div>
              </div>

              <div class="tag-list">
                <span v-for="skill in employee.skills.slice(0, 4)" :key="skill.skillName" class="tag-item">{{ skill.skillName }}</span>
                <span v-if="employee.skills.length === 0" class="muted">还没有绑定技能</span>
              </div>

              <div class="employee-card-footer">
                <p>{{ employee.latestRun?.summary || "还没有最近结果" }}</p>
                <span>进入工作台</span>
              </div>
            </NuxtLink>

            <EmptyState
              v-if="filteredEmployees.length === 0"
              title="还没有员工"
              description="先完成左侧创建流程，把第一个可自动运行的员工建起来。"
            />
          </div>
        </section>
      </div>
    </section>
  </main>
</template>
