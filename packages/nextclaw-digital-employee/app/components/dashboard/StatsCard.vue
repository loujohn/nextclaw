<script setup lang="ts">
import type { Component } from "vue";

defineProps<{
  icon: Component;
  iconColor?: string;
  label: string;
  value: number | string;
  unit?: string;
  barPercent: number;
  barColor?: string;
}>();
</script>

<template>
  <article class="group relative rounded-2xl border border-border/60 bg-card px-5 py-[18px] transition-all duration-300 hover:shadow-[0_8px_30px_rgba(0,0,0,0.06)] hover:-translate-y-[2px] hover:border-border overflow-hidden">
    <div class="absolute inset-0 bg-gradient-to-br from-primary/[0.02] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
    <div class="relative">
      <div
        class="mb-3 flex h-10 w-10 items-center justify-center rounded-xl shadow-sm ring-1"
        :class="iconColor ?? 'bg-gradient-to-br from-primary/12 to-primary/5 ring-primary/10 text-primary'"
      >
        <component :is="icon" class="h-5 w-5" :stroke-width="1.8" />
      </div>
      <p class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80 mb-1">{{ label }}</p>
      <p class="text-[34px] font-extrabold tracking-tight leading-none tabular-nums">
        {{ value }}
        <span v-if="unit" class="text-[13px] font-medium text-muted-foreground/70 ml-1">{{ unit }}</span>
      </p>
      <div class="mt-3 h-[4px] w-full overflow-hidden rounded-full bg-muted/50">
        <div
          class="h-full rounded-full transition-all duration-1000 ease-out"
          :class="barColor ?? 'bg-primary'"
          :style="{ width: Math.min(barPercent, 100) + '%' }"
        />
      </div>
    </div>
  </article>
</template>
