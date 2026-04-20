<script setup lang="ts">
import { Plus, Play, Pencil, Trash2, Clock, Zap, ToggleLeft, ToggleRight, Loader2 } from "lucide-vue-next";
import { formatDateTime } from "~~/shared/ui-models";
import {
  buildCronExpr,
  parseCronToVisual,
  cronHumanLabel,
  everyMsHumanLabel,
  type RepeatType
} from "~~/shared/cron-utils";

const route = useRoute();
const employeeId = computed(() => String(route.params.id));

import type { ScheduleJob, JobsPayload } from "~~/shared/api-types";

const { data, refresh } = useLazyFetch<JobsPayload>(() => `/api/employees/${employeeId.value}/jobs`);

const jobs = computed(() => data.value?.data ?? []);

const showDialog = ref(false);
const editingJobId = ref<string | null>(null);
const saving = ref(false);
const runningJobId = ref<string | null>(null);
const cronInputMode = ref<"visual" | "raw">("visual");

const { toasts, showToast, dismissToast } = useToast();
const formError = ref<string | null>(null);
const runDebounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

const form = reactive({
  name: "",
  description: "",
  scheduleKind: "cron" as "cron" | "every",
  repeatType: "daily" as RepeatType,
  date: "",
  weekday: "1",
  dayOfMonth: "1",
  time: "09:00",
  cronExpr: "0 9 * * *",
  everyHours: 0,
  everyMins: 30,
  taskPrompt: "",
  enabled: true
});

function openCreate() {
  editingJobId.value = null;
  formError.value = null;
  Object.assign(form, {
    name: "", description: "", scheduleKind: "cron",
    repeatType: "daily", date: "", weekday: "1", dayOfMonth: "1",
    time: "09:00", cronExpr: "0 9 * * *",
    everyHours: 0, everyMins: 30, taskPrompt: "", enabled: true
  });
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
  if (!form.name.trim() || formError.value) return;
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
      cronExpr, everyMs,
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
  if (runDebounceTimers.has(jobId)) return;
  if (runningJobId.value === jobId) return;
  const timer = setTimeout(() => { runDebounceTimers.delete(jobId); }, 2000);
  runDebounceTimers.set(jobId, timer);
  runningJobId.value = jobId;
  try {
    await $fetch(`/api/employees/${employeeId.value}/jobs/${jobId}/run`, { method: "POST" });
    await refresh();
    showToast("success", "任务已触发，正在后台执行中");
  } catch (err) {
    // Surface the backend's structured reason when present so users can tell
    // a disabled job apart from an engine blow-up. `$fetch` surfaces the
    // `createError({ statusMessage })` only on the top-level `statusMessage`,
    // and our API mirrors the same copy on `data.message` for a single
    // canonical field. `e.data.statusMessage` never actually exists — that
    // was a defensive-but-dead fallback that has been removed.
    const e = err as { statusMessage?: string; data?: { message?: string; reason?: string } };
    const reason = e?.data?.reason;
    const detail = e?.data?.message ?? e?.statusMessage;
    let message = detail ? `触发失败：${detail}` : "触发失败，请稍后重试";
    // `runtime_missing` means the scheduler registration drifted from the
    // DB, which can't self-recover. The only working recovery path today is
    // a manual disable→enable cycle (which runs through `updateJob`), so
    // guide the user instead of just echoing the raw message.
    if (reason === "runtime_missing") {
      message = "该任务调度器状态异常，请先关闭再启用任务以重置调度。";
    }
    showToast("error", message);
    // If the backend says the job itself is gone, reload so the UI drops
    // the stale row instead of letting the user click again on a phantom
    // entry that will keep failing the same way. `runtime_missing` does
    // NOT delete the DB row, so we leave the list alone there.
    if (reason === "job_not_found") {
      await refresh();
    }
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

    <div
      v-if="jobs.length === 0"
      class="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card py-14 text-center"
    >
      <Clock class="mb-3 h-9 w-9 text-muted-foreground/40" :stroke-width="1.2" />
      <p class="text-sm font-medium text-muted-foreground">还没有定时任务</p>
      <p class="mt-1 text-xs text-muted-foreground/70">点击右上角"新增任务"创建第一个独立定时任务</p>
    </div>

    <div v-else class="space-y-3">
      <div
        v-for="job in jobs"
        :key="job.id"
        class="rounded-xl border border-border bg-card p-4 shadow-sm transition-opacity"
        :class="!job.enabled ? 'opacity-55' : ''"
      >
        <div class="flex items-start justify-between gap-4">
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

          <div class="flex shrink-0 items-center gap-1.5">
            <span class="relative group/tip">
              <button
                class="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
                :disabled="runningJobId === job.id || runDebounceTimers.has(job.id)"
                @click="runJobNow(job.id)"
              >
                <Loader2 v-if="runningJobId === job.id" class="h-3.5 w-3.5 animate-spin" :stroke-width="1.8" />
                <Play v-else class="h-3.5 w-3.5" :stroke-width="1.8" />
              </button>
              <span class="pointer-events-none absolute bottom-full left-1/2 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-popover px-2 py-1 text-[11px] text-popover-foreground shadow-md opacity-0 transition-opacity duration-150 group-hover/tip:opacity-100 z-20">
                立即执行
              </span>
            </span>
            <span class="relative group/tip">
              <button
                class="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                @click="toggleEnabled(job)"
              >
                <component :is="job.enabled ? ToggleRight : ToggleLeft" class="h-3.5 w-3.5" :stroke-width="1.8" />
              </button>
              <span class="pointer-events-none absolute bottom-full left-1/2 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-popover px-2 py-1 text-[11px] text-popover-foreground shadow-md opacity-0 transition-opacity duration-150 group-hover/tip:opacity-100 z-20">
                {{ job.enabled ? '停用任务' : '启用任务' }}
              </span>
            </span>
            <span class="relative group/tip">
              <button
                class="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                @click="openEdit(job)"
              >
                <Pencil class="h-3.5 w-3.5" :stroke-width="1.8" />
              </button>
              <span class="pointer-events-none absolute bottom-full left-1/2 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-popover px-2 py-1 text-[11px] text-popover-foreground shadow-md opacity-0 transition-opacity duration-150 group-hover/tip:opacity-100 z-20">
                编辑任务
              </span>
            </span>
            <span class="relative group/tip">
              <button
                class="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                @click="deleteJob(job.id)"
              >
                <Trash2 class="h-3.5 w-3.5" :stroke-width="1.8" />
              </button>
              <span class="pointer-events-none absolute bottom-full left-1/2 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-popover px-2 py-1 text-[11px] text-popover-foreground shadow-md opacity-0 transition-opacity duration-150 group-hover/tip:opacity-100 z-20">
                删除任务
              </span>
            </span>
          </div>
        </div>
      </div>
    </div>

    <EmployeesJobFormDialog
      :visible="showDialog"
      :form="form"
      :editing-job-id="editingJobId"
      :saving="saving"
      :error="formError"
      :cron-input-mode="cronInputMode"
      @save="saveJob"
      @close="closeDialog"
      @update:cron-input-mode="cronInputMode = $event"
      @update:error="formError = $event"
    />

    <SharedToastContainer :toasts="toasts" @dismiss="dismissToast" />
  </div>
</template>

<style scoped>
.toast-enter-active,
.toast-leave-active {
  transition: all 0.25s ease;
}
.toast-enter-from {
  opacity: 0;
  transform: translateY(-8px);
}
.toast-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
