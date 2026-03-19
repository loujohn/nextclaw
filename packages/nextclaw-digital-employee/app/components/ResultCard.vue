<script setup lang="ts">
import type { ChatResultCardView } from "~~/shared/ui-models";
import { renderMarkdown } from "~/lib/utils";

defineProps<{ card: ChatResultCardView }>();

const kindLabel: Record<string, string> = {
  summary: "摘要",
  projects: "项目",
  owners: "成员",
  actions: "动作",
  error: "异常"
};

const toneBorder: Record<string, string> = {
  teal: "border-primary/20",
  amber: "border-warning/20",
  rose: "border-destructive/20"
};

const toneBadge: Record<string, string> = {
  teal: "bg-primary/10 text-primary",
  amber: "bg-warning/10 text-warning-foreground",
  rose: "bg-destructive/10 text-destructive"
};
</script>

<template>
  <article class="rounded-xl border bg-card p-4 shadow-sm" :class="toneBorder[card.tone] ?? 'border-border'">
    <div class="mb-2 flex items-center justify-between">
      <p class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{{ card.title }}</p>
      <span class="rounded-full px-2 py-0.5 text-[10px] font-bold" :class="toneBadge[card.tone] ?? 'bg-muted text-muted-foreground'">
        {{ kindLabel[card.kind] ?? "详情" }}
      </span>
    </div>
    <div class="result-card-md text-sm font-medium leading-relaxed" v-html="renderMarkdown(card.content)" />
    <ul v-if="card.items.length > 1" class="result-card-md mt-2 space-y-1 pl-4 text-sm text-muted-foreground">
      <li v-for="item in card.items.slice(1)" :key="item" v-html="renderMarkdown(item)" />
    </ul>
  </article>
</template>
