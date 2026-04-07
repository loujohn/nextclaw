<script setup lang="ts">
import { AlertTriangle, ArrowLeft, RotateCw } from "lucide-vue-next";

const props = defineProps<{ error: { statusCode: number; statusMessage?: string; message?: string } }>();

const title = computed(() => {
  if (props.error.statusCode === 404) return "页面不存在";
  if (props.error.statusCode >= 500) return "服务异常";
  return "出错了";
});

const description = computed(() => {
  if (props.error.statusCode === 404) return "你访问的页面不存在或已被移除";
  return props.error.statusMessage || props.error.message || "发生了未知错误，请稍后重试";
});

function handleBack() {
  clearError({ redirect: "/dashboard" });
}

function handleRetry() {
  clearError({ redirect: useRoute().fullPath });
}
</script>

<template>
  <div class="flex min-h-screen items-center justify-center bg-background px-4">
    <div class="mx-auto max-w-md text-center">
      <div class="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-destructive/10">
        <AlertTriangle class="h-8 w-8 text-destructive" :stroke-width="1.5" />
      </div>

      <p class="mb-2 text-5xl font-bold text-foreground">{{ error.statusCode }}</p>
      <h1 class="mb-2 text-xl font-semibold text-foreground">{{ title }}</h1>
      <p class="mb-8 text-sm text-muted-foreground">{{ description }}</p>

      <div class="flex items-center justify-center gap-3">
        <button
          class="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          @click="handleBack"
        >
          <ArrowLeft class="h-4 w-4" />
          返回首页
        </button>
        <button
          class="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          @click="handleRetry"
        >
          <RotateCw class="h-4 w-4" />
          重试
        </button>
      </div>
    </div>
  </div>
</template>
