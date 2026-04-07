<script setup lang="ts">
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) return String(error.message);
  return "发生了未知错误";
}
</script>

<template>
  <NuxtLayout>
    <NuxtErrorBoundary>
      <NuxtPage />
      <template #error="{ error, clearError }">
        <div class="flex min-h-[60vh] items-center justify-center px-4">
          <div class="mx-auto max-w-md text-center">
            <p class="mb-2 text-lg font-semibold text-foreground">页面渲染出错</p>
            <p class="mb-6 text-sm text-muted-foreground">{{ getErrorMessage(error) }}</p>
            <button
              class="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              @click="clearError"
            >
              重试
            </button>
          </div>
        </div>
      </template>
    </NuxtErrorBoundary>
  </NuxtLayout>
</template>
