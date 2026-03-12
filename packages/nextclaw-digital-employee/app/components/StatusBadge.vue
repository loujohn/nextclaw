<script setup lang="ts">
withDefaults(
  defineProps<{
    label: string;
    tone?: "teal" | "amber" | "slate" | "danger";
  }>(),
  {
    tone: "slate"
  }
);
</script>

<template>
  <span class="status-badge" :data-tone="tone">{{ label }}</span>
</template>
