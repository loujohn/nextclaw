<script setup lang="ts">
import { Sparkles, ArrowRight } from "lucide-vue-next";

defineProps<{
  title: string;
  description: string;
  actionLabel?: string;
  to?: string;
}>();
</script>

<template>
  <div class="flex flex-col items-center rounded-2xl border border-dashed border-border bg-muted/10 px-6 py-10 text-center">
    <div class="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/5">
      <svg class="h-7 w-7 text-primary/40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 2L2 7l10 5 10-5-10-5z" />
        <path d="M2 17l10 5 10-5" />
        <path d="M2 12l10 5 10-5" />
      </svg>
    </div>
    <p class="text-sm font-medium text-foreground">{{ title }}</p>
    <p class="mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground">{{ description }}</p>
    <NuxtLink
      v-if="actionLabel && to"
      :to="to"
      class="btn-ghost mt-4 text-xs"
    >
      {{ actionLabel }}
      <ArrowRight class="h-3 w-3" />
    </NuxtLink>
  </div>
</template>
