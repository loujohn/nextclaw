<script setup lang="ts">
import { CheckCircle2, BarChart3, Target } from "lucide-vue-next";
import type { Component } from "vue";

defineProps<{
  todayRunCount: number;
  totalRunCount: number;
  successRate: number;
}>();

const cards: Array<{
  key: "today" | "total" | "rate";
  icon: Component;
  iconColor: string;
  label: string;
  barColor: string;
}> = [
  { key: "today", icon: CheckCircle2, iconColor: "bg-emerald-50 ring-emerald-200/50 text-emerald-500", label: "今日运行", barColor: "bg-emerald-500" },
  { key: "total", icon: BarChart3, iconColor: "bg-blue-50 ring-blue-200/50 text-blue-500", label: "累计运行", barColor: "bg-blue-500" },
  { key: "rate", icon: Target, iconColor: "bg-emerald-50 ring-emerald-200/50 text-emerald-500", label: "成功率", barColor: "bg-emerald-500" },
];
</script>

<template>
  <section class="grid grid-cols-3 gap-3.5">
    <article
      v-for="card in cards"
      :key="card.key"
      class="group relative rounded-2xl border border-border/60 bg-card px-5 py-[18px] transition-all duration-300 hover:shadow-[0_8px_30px_rgba(0,0,0,0.06)] hover:-translate-y-[2px] hover:border-border overflow-hidden"
    >
      <div class="absolute inset-0 bg-gradient-to-br from-primary/[0.02] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      <div class="relative">
        <div
          class="mb-3 flex h-10 w-10 items-center justify-center rounded-xl shadow-sm ring-1"
          :class="card.iconColor"
        >
          <component :is="card.icon" class="h-5 w-5" :stroke-width="1.8" />
        </div>
        <p class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80 mb-1">{{ card.label }}</p>
        <p class="text-[34px] font-extrabold tracking-tight leading-none tabular-nums">
          <template v-if="card.key === 'today'">{{ todayRunCount }}</template>
          <template v-else-if="card.key === 'total'">{{ totalRunCount }}</template>
          <template v-else>{{ successRate }}</template>
          <span class="text-[13px] font-medium text-muted-foreground/70 ml-1">
            {{ card.key === 'rate' ? '%' : '次' }}
          </span>
        </p>
        <div class="mt-3 h-[4px] w-full overflow-hidden rounded-full bg-muted/50">
          <div
            class="h-full rounded-full transition-all duration-1000 ease-out"
            :class="card.barColor"
            :style="{
              width: card.key === 'today'
                ? Math.min(todayRunCount * 10, 100) + '%'
                : card.key === 'total'
                  ? Math.min(totalRunCount / 5, 100) + '%'
                  : successRate + '%'
            }"
          />
        </div>
      </div>
    </article>
  </section>
</template>
