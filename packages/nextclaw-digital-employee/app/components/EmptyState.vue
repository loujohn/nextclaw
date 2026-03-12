<script setup lang="ts">
defineProps<{
  title: string;
  description: string;
  actionLabel?: string;
  to?: string;
}>();
</script>

<template>
  <div class="empty-state">
    <div class="empty-state-icon">
      <AppIcon name="spark" :size="18" />
    </div>
    <div class="empty-state-copy">
      <strong>{{ title }}</strong>
      <p>{{ description }}</p>
    </div>
    <NuxtLink v-if="actionLabel && to" class="ghost-link" :to="to">{{ actionLabel }}</NuxtLink>
  </div>
</template>
