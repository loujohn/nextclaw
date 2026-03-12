<script setup lang="ts">
import { ChevronRight } from "lucide-vue-next";

defineProps<{
  items: Array<{ label: string; to?: string }>;
}>();
</script>

<template>
  <nav class="flex items-center gap-1 text-[13px] text-muted-foreground">
    <template v-for="(item, i) in items" :key="item.label">
      <NuxtLink
        v-if="item.to"
        :to="item.to"
        class="transition-colors hover:text-foreground"
      >
        {{ item.label }}
      </NuxtLink>
      <span v-else class="font-medium text-foreground">{{ item.label }}</span>
      <ChevronRight v-if="i < items.length - 1" class="h-3.5 w-3.5 text-muted-foreground/50" :stroke-width="2" />
    </template>
  </nav>
</template>
