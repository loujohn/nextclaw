<script setup lang="ts">
import { ClipboardList, TrendingUp, FlaskConical, Megaphone, Lightbulb, Sparkles } from "lucide-vue-next";
import type { Component } from "vue";

defineProps<{
  categories: Array<{
    category: string;
    categoryLabel: string;
    emoji: string;
    count: number;
  }>;
  totalSkillCount: number;
}>();

const emit = defineEmits<{ clickCategory: [slug: string] }>();

const CATEGORY_STYLES: Record<string, { icon: Component; bg: string; text: string; ring: string }> = {
  "project-management": { icon: ClipboardList, bg: "bg-blue-50", text: "text-blue-500", ring: "ring-blue-200/50" },
  "business-management": { icon: TrendingUp, bg: "bg-violet-50", text: "text-violet-500", ring: "ring-violet-200/50" },
  "product-rd": { icon: FlaskConical, bg: "bg-emerald-50", text: "text-emerald-500", ring: "ring-emerald-200/50" },
  "marketing": { icon: Megaphone, bg: "bg-orange-50", text: "text-orange-500", ring: "ring-orange-200/50" },
  "solutions": { icon: Lightbulb, bg: "bg-amber-50", text: "text-amber-500", ring: "ring-amber-200/50" },
  "general": { icon: Sparkles, bg: "bg-indigo-50", text: "text-indigo-500", ring: "ring-indigo-200/50" },
};

const TEXT_COLORS: Record<string, string> = {
  "project-management": "text-blue-600",
  "business-management": "text-violet-600",
  "product-rd": "text-emerald-600",
  "marketing": "text-orange-600",
  "solutions": "text-amber-600",
  "general": "text-indigo-600",
};

function getCatStyle(slug: string) {
  return CATEGORY_STYLES[slug] ?? { icon: Sparkles, bg: "bg-muted", text: "text-muted-foreground", ring: "ring-border" };
}
</script>

<template>
  <section class="rounded-2xl border border-border/60 bg-card overflow-hidden">
    <div class="flex items-center justify-between px-5 py-3.5 border-b border-border/60">
      <h3 class="text-sm font-bold">技能能力版图</h3>
      <p class="text-[11px] font-semibold text-muted-foreground/80">
        平台共 <strong class="text-primary text-base font-extrabold mr-0.5">{{ totalSkillCount }}</strong> 个技能 · 6 大分类
      </p>
    </div>
    <div class="grid grid-cols-6">
      <div
        v-for="(cat, i) in categories"
        :key="cat.category"
        class="group flex flex-col items-center py-5 px-4 cursor-pointer transition-all duration-300 hover:bg-muted/20"
        :class="i < categories.length - 1 ? 'border-r border-border/30' : ''"
        @click="emit('clickCategory', cat.category)"
      >
        <div
          class="flex h-11 w-11 items-center justify-center rounded-xl mb-3 ring-1 shadow-sm transition-all duration-300 group-hover:scale-110 group-hover:shadow-md"
          :class="[getCatStyle(cat.category).bg, getCatStyle(cat.category).text, getCatStyle(cat.category).ring]"
        >
          <component :is="getCatStyle(cat.category).icon" class="h-5 w-5" :stroke-width="1.8" />
        </div>
        <p class="text-xs font-semibold text-muted-foreground/80 mb-1.5 transition-colors group-hover:text-foreground">{{ cat.categoryLabel }}</p>
        <p
          class="text-[24px] font-extrabold leading-none tabular-nums transition-transform duration-300 group-hover:scale-105"
          :class="TEXT_COLORS[cat.category] ?? 'text-foreground'"
        >
          {{ cat.count }}
        </p>
        <p class="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wide mt-1">个技能</p>
      </div>
    </div>
  </section>
</template>
