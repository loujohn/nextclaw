<script setup lang="ts">
import {
  buildCronExpr,
  validateCronVisual,
  WEEKDAY_LABELS,
  WEEKDAY_OPTIONS,
  type RepeatType
} from "~~/shared/cron-utils";

interface JobFormState {
  name: string;
  description: string;
  scheduleKind: "cron" | "every";
  repeatType: RepeatType;
  date: string;
  weekday: string;
  dayOfMonth: string;
  time: string;
  cronExpr: string;
  everyHours: number;
  everyMins: number;
  taskPrompt: string;
  enabled: boolean;
}

const props = defineProps<{
  visible: boolean;
  form: JobFormState;
  editingJobId: string | null;
  saving: boolean;
  error: string | null;
  cronInputMode: "visual" | "raw";
}>();

const emit = defineEmits<{
  save: [];
  close: [];
  "update:cronInputMode": [mode: "visual" | "raw"];
  "update:error": [error: string | null];
}>();

const previewCronExpr = computed(() => {
  if (props.form.scheduleKind !== "cron" || props.cronInputMode !== "visual") return "";
  return buildCronExpr(props.form.repeatType, {
    date: props.form.date,
    weekday: props.form.weekday,
    dayOfMonth: props.form.dayOfMonth,
    time: props.form.time
  });
});

const todayStr = computed(() => new Date().toISOString().slice(0, 10));

function handleSave() {
  if (props.form.scheduleKind === "cron" && props.cronInputMode === "visual") {
    const validation = validateCronVisual(props.form.repeatType, { time: props.form.time, date: props.form.date });
    if (!validation.ok) {
      emit("update:error", validation.error ?? "配置有误");
      return;
    }
  }
  if (props.form.scheduleKind === "every" && props.form.everyHours === 0 && props.form.everyMins === 0) {
    emit("update:error", "间隔时间不能为 0，最短 1 分钟");
    return;
  }
  emit("update:error", null);
  emit("save");
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      @click.self="emit('close')"
    >
      <div class="w-full max-w-lg rounded-2xl border border-border bg-card shadow-xl max-h-[90vh] overflow-y-auto">
        <div class="flex items-center justify-between border-b border-border px-5 py-4">
          <h3 class="text-base font-semibold">{{ editingJobId ? "编辑定时任务" : "新增定时任务" }}</h3>
          <button class="rounded-lg p-1 text-muted-foreground hover:text-foreground" @click="emit('close')">✕</button>
        </div>

        <form class="space-y-4 p-5" @submit.prevent="handleSave">
          <label class="block space-y-1.5">
            <span class="text-sm font-medium">任务名称 <span class="text-destructive">*</span></span>
            <input v-model="form.name" class="input-field" placeholder="例如：每日工时提醒" required />
          </label>

          <label class="block space-y-1.5">
            <span class="text-sm font-medium">描述（可选）</span>
            <input v-model="form.description" class="input-field" placeholder="简短说明这个任务的用途" />
          </label>

          <label class="block space-y-1.5">
            <span class="text-sm font-medium">运行方式</span>
            <select v-model="form.scheduleKind" class="input-field">
              <option value="cron">按时间表</option>
              <option value="every">固定间隔</option>
            </select>
          </label>

          <div v-if="form.scheduleKind === 'cron'" class="space-y-3">
            <div class="flex items-center gap-0.5 rounded-lg bg-muted/60 p-1 w-fit">
              <button
                type="button"
                class="rounded-md px-3 py-1 text-xs font-medium transition-colors"
                :class="cronInputMode === 'visual' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'"
                @click="emit('update:cronInputMode', 'visual')"
              >可视化配置</button>
              <button
                type="button"
                class="rounded-md px-3 py-1 text-xs font-medium transition-colors"
                :class="cronInputMode === 'raw' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'"
                @click="emit('update:cronInputMode', 'raw')"
              >Cron 表达式</button>
            </div>

            <div v-if="cronInputMode === 'visual'" class="space-y-2">
              <span class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">计划</span>
              <div class="flex flex-wrap items-center gap-2">
                <select v-model="form.repeatType" class="input-field flex-1 min-w-[110px]">
                  <option value="none">不重复</option>
                  <option value="daily">每天</option>
                  <option value="weekly">每周</option>
                  <option value="monthly">每月</option>
                </select>
                <input v-if="form.repeatType === 'none'" v-model="form.date" type="date" :min="todayStr" class="input-field flex-1 min-w-[140px]" />
                <select v-else-if="form.repeatType === 'weekly'" v-model="form.weekday" class="input-field flex-1 min-w-[100px]">
                  <option v-for="d in WEEKDAY_OPTIONS" :key="d" :value="String(d)">{{ WEEKDAY_LABELS[d] }}</option>
                </select>
                <select v-else-if="form.repeatType === 'monthly'" v-model="form.dayOfMonth" class="input-field flex-1 min-w-[100px]">
                  <option v-for="d in 31" :key="d" :value="String(d)">{{ d }}日</option>
                </select>
                <input v-model="form.time" type="time" class="input-field flex-1 min-w-[110px]" />
              </div>
              <p class="text-xs text-muted-foreground">
                Cron：<code class="font-mono">{{ previewCronExpr }}</code>
              </p>
            </div>

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
            <input id="job-enabled" v-model="form.enabled" type="checkbox" class="h-4 w-4 rounded accent-primary" />
            <label for="job-enabled" class="text-sm font-medium cursor-pointer select-none">启用（保存后立即生效）</label>
          </div>

          <div class="flex justify-end gap-2 pt-1">
            <p v-if="error" class="mr-auto text-xs text-destructive self-center">{{ error }}</p>
            <button type="button" class="btn-ghost" @click="emit('close')">取消</button>
            <button type="submit" class="btn-primary" :disabled="saving">
              {{ saving ? "保存中…" : "保存" }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </Teleport>
</template>
