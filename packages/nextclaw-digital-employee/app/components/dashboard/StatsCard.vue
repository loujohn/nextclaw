<script setup lang="ts">
defineProps<{
  icon: string;
  label: string;
  value: number | string;
  unit?: string;
  barPercent: number;
  barColor?: string;
}>();
</script>

<template>
  <article class="rounded-2xl border border-border bg-card px-5 py-[18px] transition-all duration-200 hover:shadow-[0_6px_20px_rgba(0,0,0,0.05)] hover:-translate-y-[1px]">
    <div class="mb-3 flex h-9 w-9 items-center justify-center rounded-[10px] bg-muted/60 text-base">
      {{ icon }}
    </div>
    <p class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-[3px]">{{ label }}</p>
    <p class="text-[32px] font-extrabold tracking-tight leading-tight">
      {{ value }}
      <span v-if="unit" class="text-[13px] font-medium text-muted-foreground ml-[3px]">{{ unit }}</span>
    </p>
    <div class="mt-2.5 h-[3px] w-full overflow-hidden rounded-full bg-border/40">
      <div
        class="h-full rounded-full transition-all duration-700 ease-out"
        :class="barColor ?? 'bg-primary'"
        :style="{ width: Math.min(barPercent, 100) + '%' }"
      />
    </div>
  </article>
</template>
