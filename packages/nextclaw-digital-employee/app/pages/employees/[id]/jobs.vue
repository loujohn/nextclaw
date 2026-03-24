<script setup lang="ts">
import { Plus, Play, Pencil, Trash2, Clock, Zap, ToggleLeft, ToggleRight } from "lucide-vue-next";
import { formatDateTime } from "~~/shared/ui-models";
import {
  buildCronExpr,
  parseCronToVisual,
  cronHumanLabel,
  everyMsHumanLabel,
  validateCronVisual,
  WEEKDAY_LABELS,
  WEEKDAY_OPTIONS,
  type RepeatType
} from "~~/shared/cron-utils";

const route = useRoute();
const employeeId = computed(() => String(route.params.id));

type ScheduleJob = {
  id: string;
  employeeId: string;
  name: string;
  description: string;
  scheduleKind: string;
  cronExpr: string | null;
  everyMs: number | null;
  heartbeatIntervalS: number | null;
  taskPrompt: string;
  enabled: boolean;
  runtimeJobId: string | null;
  nextRunAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type JobsPayload = { ok: boolean; data: ScheduleJob[] };

const { data, refresh } = await useFetch<JobsPayload>(() => `/api/employees/${employeeId.value}/jobs`);

const jobs = computed(() => data.value?.data ?? []);

// ── Dialog state ──────────────────────────────────────────────────────────────
const showDialog = ref(false);
const editingJobId = ref<string | null>(null);
const saving = ref(false);
const runningJobId = ref<string | null>(null);
const cronInputMode = ref<"visual" | "raw">("visual");
const formError = ref<string | null>(null);

const form = reactive({
  name: "",
  description: "",
  scheduleKind: "cron" as "cron" | "every",
  // cron visual
  repeatType: "daily" as RepeatType,
  date: "",
  weekday: "1",
  dayOfMonth: "1",
  time: "09:00",
  // cron raw
  cronExpr: "0 9 * * *",
  // every
  everyHours: 0,
  everyMins: 30,
  // common
  taskPrompt: "",
  enabled: true
});

// ── Cron utilities (delegated to shared/cron-utils) ──────────────────────────
const previewCronExpr = computed(() => {
  if (form.scheduleKind !== "cron" || cronInputMode.value !== "visual") return "";
  return buildCronExpr(form.repeatType, {
    date: form.date,
    weekday: form.weekday,
    dayOfMonth: form.dayOfMonth,
    time: form.time
  });
});

const todayStr = computed(() => new Date().toISOString().slice(0, 10));

// ── Dialog open/close ─────────────────────────────────────────────────────────
function openCreate() {
  editingJobId.value = null;
  formError.value = null;
  form.name = "";
  form.description = "";
  form.scheduleKind = "cron";
  form.repeatType = "daily";
  form.date = "";
  form.weekday = "1";
  form.dayOfMonth = "1";
  form.time = "09:00";
  form.cronExpr = "0 9 * * *";
  form.everyHours = 0;
  form.everyMins = 30;
  form.taskPrompt = "";
  form.enabled = true;
  cronInputMode.value = "visual";
  showDialog.value = true;
}

function openEdit(job: ScheduleJob) {
  editingJobId.value = job.id;
  formError.value = null;
  form.name = job.name;
  form.description = job.description;
  form.scheduleKind = job.scheduleKind === "every" ? "every" : "cron";
  if (form.scheduleKind === "cron") {
    const visual = parseCronToVisual(job.cronExpr ?? "0 9 * * *");
    cronInputMode.value = visual.mode;
    form.repeatType = visual.repeatType;
    form.date = visual.date;
    form.weekday = visual.weekday;
    form.dayOfMonth = visual.dayOfMonth;
    form.time = visual.time;
    form.cronExpr = visual.rawCron || (job.cronExpr ?? "0 9 * * *");
  } else {
    const ms = job.everyMs ?? 1800000;
    form.everyHours = Math.floor(ms / 3600000);
    form.everyMins = Math.floor((ms % 3600000) / 60000);
  }
  form.taskPrompt = job.taskPrompt;
  form.enabled = job.enabled;
  showDialog.value = true;
}

function closeDialog() {
  showDialog.value = false;
  editingJobId.value = null;
  formError.value = null;
}

async function saveJob() {
  if (!form.name.trim()) return;

  // Validate cron visual before save
  if (form.scheduleKind === "cron" && cronInputMode.value === "visual") {
    const validation = validateCronVisual(form.repeatType, { time: form.time, date: form.date });
    if (!validation.ok) {
      formError.value = validation.error ?? "配置有误";
      return;
    }
  }
  // Validate every: at least 1 min
  if (form.scheduleKind === "every" && form.everyHours === 0 && form.everyMins === 0) {
    formError.value = "间隔时间不能为 0，最短 1 分钟";
    return;
  }

  formError.value = null;
  saving.value = true;
  try {
    const cronExpr = form.scheduleKind === "cron"
      ? (cronInputMode.value === "visual"
          ? buildCronExpr(form.repeatType, { date: form.date, weekday: form.weekday, dayOfMonth: form.dayOfMonth, time: form.time })
          : form.cronExpr)
      : null;
    const everyMs = form.scheduleKind === "every"
      ? Math.max(60000, form.everyHours * 3600000 + form.everyMins * 60000)
      : null;
    const body = {
      name: form.name.trim(),
      description: form.description.trim(),
      scheduleKind: form.scheduleKind,
      cronExpr,
      everyMs,
      taskPrompt: form.taskPrompt.trim(),
      enabled: form.enabled
    };
    if (editingJobId.value) {
      await $fetch(`/api/employees/${employeeId.value}/jobs/${editingJobId.value}`, { method: "PATCH", body });
    } else {
      await $fetch(`/api/employees/${employeeId.value}/jobs`, { method: "POST", body });
    }
    closeDialog();
    await refresh();
  } finally {
    saving.value = false;
  }
}

async function deleteJob(jobId: string) {
  if (!confirm("确定要删除这个定时任务吗？删除后不可恢复。")) return;
  await $fetch(`/api/employees/${employeeId.value}/jobs/${jobId}`, { method: "DELETE" });
  await refresh();
}

async function runJobNow(jobId: string) {
  runningJobId.value = jobId;
  try {
    await $fetch(`/api/employees/${employeeId.value}/jobs/${jobId}/run`, { method: "POST" });
    await refresh();
  } finally {
    runningJobId.value = null;
  }
}

async function toggleEnabled(job: ScheduleJob) {
  await $fetch(`/api/employees/${employeeId.value}/jobs/${job.id}`, {
    method: "PATCH",
    body: { enabled: !job.enabled }
  });
  await refresh();
}

// ── Display helpers ───────────────────────────────────────────────────────────
function scheduleKindLabel(kind: string) {
  return kind === "every" ? "固定间隔" : "按时间表";
}

function scheduleDetail(job: ScheduleJob) {
  if (job.scheduleKind === "cron") return cronHumanLabel(job.cronExpr ?? "");
  if (job.scheduleKind === "every") return everyMsHumanLabel(job.everyMs ?? 0);
  return "—";
}

function scheduleIcon(kind: string) {
  return kind === "every" ? Zap : Clock;
}
</script>

<template>
  <div class="space-y-5">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <span class="section-label">多任务调度</span>
        <h2 class="mt-0.5 text-lg font-semibold">定时任务列表</h2>
        <p class="mt-1 text-sm text-muted-foreground">每个任务独立调度、独立启停、独立运行记录，互不干扰。</p>
      </div>
      <button class="btn-primary" @click="openCreate">
        <Plus class="h-3.5 w-3.5" :stroke-width="2" />
        新增任务
      </button>
    </div>

    <!-- Empty state -->
    <div
      v-if="jobs.length === 0"
      class="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card py-14 text-center"
    >
      <Clock class="mb-3 h-9 w-9 text-muted-foreground/40" :stroke-width="1.2" />
      <p class="text-sm font-medium text-muted-foreground">还没有定时任务</p>
      <p class="mt-1 text-xs text-muted-foreground/70">点击右上角"新增任务"创建第一个独立定时任务</p>
    </div>

    <!-- Job list -->
    <div v-else class="space-y-3">
      <div
        v-for="job in jobs"
        :key="job.id"
        class="rounded-xl border border-border bg-card p-4 shadow-sm transition-opacity"
        :class="!job.enabled ? 'opacity-55' : ''"
      >
        <div class="flex items-start justify-between gap-4">
          <!-- Left: info -->
          <div class="min-w-0 flex-1 space-y-1.5">
            <div class="flex items-center gap-2">
              <component :is="scheduleIcon(job.scheduleKind)" class="h-4 w-4 shrink-0 text-primary" :stroke-width="1.8" />
              <span class="truncate font-semibold text-sm">{{ job.name }}</span>
              <span
                class="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium"
                :class="job.enabled ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'"
              >
                {{ job.enabled ? "运行中" : "已停用" }}
              </span>
            </div>
            <p v-if="job.description" class="text-xs text-muted-foreground">{{ job.description }}</p>
            <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>
                <span class="font-medium text-foreground">{{ scheduleKindLabel(job.scheduleKind) }}</span>
                &nbsp;·&nbsp;{{ scheduleDetail(job) }}
              </span>
              <span v-if="job.nextRunAt && job.enabled">
                下次运行&nbsp;
                <span class="font-medium text-foreground">{{ formatDateTime(job.nextRunAt) }}</span>
              </span>
              <span v-if="!job.enabled" class="text-muted-foreground/60">已暂停，不会自动执行</span>
            </div>
            <p v-if="job.taskPrompt" class="mt-1 rounded-lg bg-muted/50 px-3 py-2 font-mono text-xs leading-relaxed text-muted-foreground line-clamp-2">
              {{ job.taskPrompt }}
            </p>
          </div>

          <!-- Right: actions -->
          <div class="flex shrink-0 items-center gap-1.5">
            <button
              class="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              title="立即执行"
              :disabled="runningJobId === job.id"
              @click="runJobNow(job.id)"
            >
              <Play class="h-3.5 w-3.5" :class="runningJobId === job.id ? 'animate-pulse' : ''" :stroke-width="1.8" />
            </button>
            <button
              class="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              :title="job.enabled ? '停用' : '启用'"
              @click="toggleEnabled(job)"
            >
              <component :is="job.enabled ? ToggleRight : ToggleLeft" class="h-3.5 w-3.5" :stroke-width="1.8" />
            </button>
            <button
              class="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              title="编辑"
              @click="openEdit(job)"
            >
              <Pencil class="h-3.5 w-3.5" :stroke-width="1.8" />
            </button>
            <button
              class="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
              title="删除"
              @click="deleteJob(job.id)"
            >
              <Trash2 class="h-3.5 w-3.5" :stroke-width="1.8" />
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Create / Edit dialog -->
    <Teleport to="body">
      <div
        v-if="showDialog"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
        @click.self="closeDialog"
      >
        <div class="w-full max-w-lg rounded-2xl border border-border bg-card shadow-xl max-h-[90vh] overflow-y-auto">
          <div class="flex items-center justify-between border-b border-border px-5 py-4">
            <h3 class="text-base font-semibold">{{ editingJobId ? "编辑定时任务" : "新增定时任务" }}</h3>
            <button class="rounded-lg p-1 text-muted-foreground hover:text-foreground" @click="closeDialog">✕</button>
          </div>

          <form class="space-y-4 p-5" @submit.prevent="saveJob">
            <label class="block space-y-1.5">
              <span class="text-sm font-medium">任务名称 <span class="text-destructive">*</span></span>
              <input
                v-model="form.name"
                class="input-field"
                placeholder="例如：每日工时提醒"
                required
              />
            </label>

            <label class="block space-y-1.5">
              <span class="text-sm font-medium">描述（可选）</span>
              <input
                v-model="form.description"
                class="input-field"
                placeholder="简短说明这个任务的用途"
              />
            </label>

            <!-- 运行方式 -->
            <label class="block space-y-1.5">
              <span class="text-sm font-medium">运行方式</span>
              <select v-model="form.scheduleKind" class="input-field">
                <option value="cron">按时间表</option>
                <option value="every">固定间隔</option>
              </select>
            </label>

            <!-- 按时间表：可视化 or 填 Cron -->
            <div v-if="form.scheduleKind === 'cron'" class="space-y-3">
              <!-- 模式切换 -->
              <div class="flex items-center gap-0.5 rounded-lg bg-muted/60 p-1 w-fit">
                <button
                  type="button"
                  class="rounded-md px-3 py-1 text-xs font-medium transition-colors"
                  :class="cronInputMode === 'visual' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'"
                  @click="cronInputMode = 'visual'"
                >可视化配置</button>
                <button
                  type="button"
                  class="rounded-md px-3 py-1 text-xs font-medium transition-colors"
                  :class="cronInputMode === 'raw' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'"
                  @click="cronInputMode = 'raw'"
                >Cron 表达式</button>
              </div>

              <!-- 可视化时间选择器 -->
              <div v-if="cronInputMode === 'visual'" class="space-y-2">
                <span class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">计划</span>
                <div class="flex flex-wrap items-center gap-2">
                  <!-- 重复类型 -->
                  <select v-model="form.repeatType" class="input-field flex-1 min-w-[110px]">
                    <option value="none">不重复</option>
                    <option value="daily">每天</option>
                    <option value="weekly">每周</option>
                    <option value="monthly">每月</option>
                  </select>
                  <!-- 日期（不重复） -->
                  <input
                    v-if="form.repeatType === 'none'"
                    v-model="form.date"
                    type="date"
                    :min="todayStr"
                    class="input-field flex-1 min-w-[140px]"
                  />
                  <!-- 星期（每周） -->
                  <select
                    v-else-if="form.repeatType === 'weekly'"
                    v-model="form.weekday"
                    class="input-field flex-1 min-w-[100px]"
                  >
                    <option v-for="d in WEEKDAY_OPTIONS" :key="d" :value="String(d)">{{ WEEKDAY_LABELS[d] }}</option>
                  </select>
                  <!-- 几号（每月） -->
                  <select
                    v-else-if="form.repeatType === 'monthly'"
                    v-model="form.dayOfMonth"
                    class="input-field flex-1 min-w-[100px]"
                  >
                    <option v-for="d in 31" :key="d" :value="String(d)">{{ d }}日</option>
                  </select>
                  <!-- 时间 -->
                  <input
                    v-model="form.time"
                    type="time"
                    class="input-field flex-1 min-w-[110px]"
                  />
                </div>
                <p class="text-xs text-muted-foreground">
                  Cron：<code class="font-mono">{{ previewCronExpr }}</code>
                </p>
              </div>

              <!-- 直填 Cron 表达式 -->
              <div v-else class="space-y-1.5">
                <span class="text-sm font-medium">Cron 表达式</span>
                <input v-model="form.cronExpr" class="input-field font-mono" placeholder="0 9 * * 1-5" />
                <p class="text-xs text-muted-foreground">
                  工作日 9:00 &rarr; <code class="font-mono">0 9 * * 1-5</code>&ensp;
                  每天 18:00 &rarr; <code class="font-mono">0 18 * * *</code>&ensp;
                  每月 1 日 &rarr; <code class="font-mono">0 9 1 * *</code>
                </p>
              </div>
            </div>

            <!-- 固定间隔 -->
            <div v-else class="space-y-2">
              <span class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">计划</span>
              <div class="flex items-center gap-2">
                <input v-model.number="form.everyHours" type="number" min="0" max="23" class="input-field w-20 text-center" />
                <span class="text-sm text-muted-foreground shrink-0">小时</span>
                <input v-model.number="form.everyMins" type="number" min="0" max="59" class="input-field w-20 text-center" />
                <span class="text-sm text-muted-foreground shrink-0">分钟</span>
              </div>
              <p class="text-xs text-muted-foreground">最短间隔 1 分钟</p>
            </div>

            <label class="block space-y-1.5">
              <span class="text-sm font-medium">任务 Prompt（可选）</span>
              <textarea
                v-model="form.taskPrompt"
                class="input-field min-h-[90px] resize-y font-mono text-xs"
                placeholder="留空则使用员工 systemPrompt + 默认定时提示语。&#10;填写后将作为本次定时触发的专属消息，覆盖默认 prompt。"
              />
            </label>

            <div class="flex items-center gap-2">
              <input
                id="job-enabled"
                v-model="form.enabled"
                type="checkbox"
                class="h-4 w-4 rounded accent-primary"
              />
              <label for="job-enabled" class="text-sm font-medium cursor-pointer select-none">启用（保存后立即生效）</label>
            </div>

            <div class="flex justify-end gap-2 pt-1">
              <p v-if="formError" class="mr-auto text-xs text-destructive self-center">{{ formError }}</p>
              <button type="button" class="btn-ghost" @click="closeDialog">取消</button>
              <button type="submit" class="btn-primary" :disabled="saving">
                {{ saving ? "保存中…" : "保存" }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Teleport>
  </div>
</template>
