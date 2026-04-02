<script setup lang="ts">
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

const CATEGORY_COLORS: Record<string, { bg: string; text: string }> = {
  "project-management": { bg: "#eff6ff", text: "#3b82f6" },
  "business-management": { bg: "#f5f3ff", text: "#8b5cf6" },
  "product-rd": { bg: "#ecfdf5", text: "#10b981" },
  "marketing": { bg: "#fff7ed", text: "#f97316" },
  "solutions": { bg: "#fffbeb", text: "#eab308" },
  "general": { bg: "#eef2ff", text: "#6366f1" },
};

function getCatColors(slug: string) {
  return CATEGORY_COLORS[slug] ?? { bg: "#f3f4f6", text: "#6b7280" };
}
</script>

<template>
  <section class="rounded-2xl border border-border bg-card overflow-hidden">
    <div class="flex items-center justify-between px-5 py-3.5 border-b border-border">
      <h3 class="text-sm font-bold">技能能力版图</h3>
      <p class="text-[11px] font-semibold text-muted-foreground">
        平台共 <strong class="text-primary text-base mr-0.5">{{ totalSkillCount }}</strong> 个技能 · 6 大分类
      </p>
    </div>
    <div class="grid grid-cols-6">
      <div
        v-for="(cat, i) in categories"
        :key="cat.category"
        class="flex flex-col items-center py-4 px-4 cursor-pointer transition-colors hover:bg-muted/30"
        :class="i < categories.length - 1 ? 'border-r border-border/40' : ''"
        @click="emit('clickCategory', cat.category)"
      >
        <div
          class="flex h-10 w-10 items-center justify-center rounded-xl text-lg mb-2.5"
          :style="{ background: getCatColors(cat.category).bg, color: getCatColors(cat.category).text }"
        >
          {{ cat.emoji }}
        </div>
        <p class="text-xs font-semibold text-muted-foreground mb-1">{{ cat.categoryLabel }}</p>
        <p class="text-[22px] font-extrabold leading-none" :style="{ color: getCatColors(cat.category).text }">
          {{ cat.count }}
        </p>
        <p class="text-[10px] font-medium text-muted-foreground/70 uppercase tracking-wide mt-0.5">个技能</p>
      </div>
    </div>
  </section>
</template>
