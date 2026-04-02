<script setup lang="ts">
defineProps<{
  integrations: Array<{
    name: string;
    type: string;
    isEnabled: boolean;
  }>;
}>();
</script>

<template>
  <section class="rounded-2xl border border-border bg-card px-5 py-3.5 flex items-center gap-4">
    <p class="text-[11px] font-semibold text-muted-foreground whitespace-nowrap">已连接系统</p>
    <div class="flex flex-1 flex-wrap gap-2.5">
      <div
        v-for="integration in integrations"
        :key="integration.name"
        class="flex items-center gap-[5px] rounded-full border border-border bg-muted/30 px-3 py-[5px] text-[11px] font-medium"
      >
        <span
          class="h-[5px] w-[5px] rounded-full"
          :class="integration.isEnabled ? 'bg-[#10b981]' : 'bg-muted-foreground/30'"
        />
        {{ integration.name }}
      </div>
      <div v-if="integrations.length === 0" class="text-[11px] text-muted-foreground">
        暂无集成
      </div>
    </div>
  </section>
</template>
