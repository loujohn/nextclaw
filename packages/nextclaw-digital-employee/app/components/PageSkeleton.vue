<script setup lang="ts">
defineProps<{
  rows?: number;
}>();
</script>

<template>
  <div class="mx-auto max-w-6xl space-y-6 p-6 lg:p-8">
    <div class="space-y-3 rounded-2xl border border-border bg-card p-6">
      <Skeleton class="h-3 w-20" />
      <Skeleton class="h-8 w-64" />
      <Skeleton class="h-4 w-96" />
    </div>

    <div class="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <div v-for="i in 4" :key="i" class="space-y-3 rounded-xl border border-border bg-card p-4">
        <Skeleton class="h-9 w-9 rounded-lg" />
        <Skeleton class="h-3 w-16" />
        <Skeleton class="h-6 w-10" />
      </div>
    </div>

    <div class="grid gap-6 lg:grid-cols-2">
      <div v-for="i in (rows ?? 2)" :key="i" class="space-y-3 rounded-xl border border-border bg-card p-5">
        <Skeleton class="h-3 w-20" />
        <Skeleton class="h-5 w-40" />
        <div class="space-y-2 pt-2">
          <Skeleton v-for="j in 3" :key="j" class="h-12 w-full rounded-lg" />
        </div>
      </div>
    </div>
  </div>
</template>
