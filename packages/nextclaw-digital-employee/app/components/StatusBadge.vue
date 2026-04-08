<script setup lang="ts">
withDefaults(
  defineProps<{
    label: string;
    tone?: "teal" | "amber" | "slate" | "danger";
  }>(),
  { tone: "slate" }
);

const cls: Record<string, string> = {
  teal: "bg-primary/10 text-primary",
  amber: "bg-warning/10 text-warning-foreground",
  slate: "bg-muted text-muted-foreground",
  danger: "bg-destructive/10 text-destructive"
};
</script>

<template>
  <span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold" :class="cls[tone]">
    {{ label }}
  </span>
</template>
